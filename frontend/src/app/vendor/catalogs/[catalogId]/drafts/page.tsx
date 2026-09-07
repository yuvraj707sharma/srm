"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../../lib/api/client";

interface Draft {
  id: string;
  catalog_id: string;
  product_name: string;
  attributes: string; // JSON string
  status: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  provenance: {
    source_document_version_id: string;
    ai_extraction_record_id: string;
    job_id: string;
  };
}

export default function DraftReviewPage() {
  const params = useParams();
  const catalogId = params.catalogId as string;
  const router = useRouter();

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editAttributes, setEditAttributes] = useState("");

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualProductName, setManualProductName] = useState("");
  const [manualAttributes, setManualAttributes] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const loadDrafts = async () => {
    try {
      setLoading(true);
      const res = await fetchApi(`/api/v1/vendor/catalogs/${catalogId}/drafts`);
      if (res.ok) {
        setDrafts(await res.json());
      } else {
        setMsg({ type: "error", text: "Failed to load drafts." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error loading drafts." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (catalogId) {
      loadDrafts();
    }
  }, [catalogId]);

  const handleSave = async (draftId: string) => {
    setMsg(null);
    let parsedAttr;
    try {
      parsedAttr = JSON.parse(editAttributes);
    } catch {
      setMsg({ type: "error", text: "Attributes must be valid JSON." });
      return;
    }
    try {
      const res = await fetchApi(`/api/v1/vendor/catalogs/drafts/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({
          product_name: editProductName,
          attributes: parsedAttr,
        }),
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Draft saved successfully." });
        setEditingId(null);
        loadDrafts();
      } else {
        setMsg({ type: "error", text: "Failed to save draft. It might have been reviewed already." });
        loadDrafts();
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error saving draft." });
    }
  };

  const handleApprove = async (draftId: string) => {
    if (!window.confirm("Approve this draft? It will be locked.")) return;
    setMsg(null);
    try {
      const res = await fetchApi(`/api/v1/vendor/catalogs/drafts/${draftId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Draft approved." });
        loadDrafts();
      } else {
        setMsg({ type: "error", text: "Failed to approve draft. It might have been reviewed already." });
        loadDrafts();
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error approving draft." });
    }
  };

  const handleReject = async (draftId: string) => {
    if (!rejectReason) {
      setMsg({ type: "error", text: "Rejection reason is required." });
      return;
    }
    setMsg(null);
    try {
      const res = await fetchApi(`/api/v1/vendor/catalogs/drafts/${draftId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Draft rejected." });
        setRejectingId(null);
        setRejectReason("");
        loadDrafts();
      } else {
        setMsg({ type: "error", text: "Failed to reject draft. It might have been reviewed already." });
        loadDrafts();
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error rejecting draft." });
    }
  };

  const startEdit = (draft: Draft) => {
    setEditingId(draft.id);
    setEditProductName(draft.product_name);
    setEditAttributes(typeof draft.attributes === "string" ? draft.attributes : JSON.stringify(draft.attributes, null, 2));
    setRejectingId(null);
  };

  const handleAddManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    let parsedAttr;
    try {
      parsedAttr = JSON.parse(manualAttributes || "{}");
    } catch {
      setMsg({ type: "error", text: "Attributes must be valid JSON." });
      return;
    }

    setAddingManual(true);
    try {
      const res = await fetchApi(`/api/v1/vendor/catalogs/${catalogId}/items/manual`, {
        method: "POST",
        body: JSON.stringify({
          product_name: manualProductName,
          attributes: parsedAttr,
        }),
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Manual item added and embedding started." });
        setShowManualAdd(false);
        setManualProductName("");
        setManualAttributes("");
        loadDrafts();
      } else {
        const data = await res.json();
        setMsg({ type: "error", text: data.error?.message || "Failed to add manual item." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error adding manual item." });
    } finally {
      setAddingManual(false);
    }
  };

  const renderDraft = (draft: Draft) => {
    const isNeedsReview = draft.status === "NEEDS_REVIEW";
    const isEditing = editingId === draft.id;
    const isRejecting = rejectingId === draft.id;

    return (
      <div key={draft.id} className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editProductName}
                onChange={(e) => setEditProductName(e.target.value)}
                className="font-bold text-lg border border-blue-500 rounded px-2 py-1 w-full max-w-md"
              />
            ) : (
              <h3 className="font-bold text-lg text-gray-900">{draft.product_name}</h3>
            )}
            <div className="text-xs text-gray-500 mt-1">
              {draft.provenance.ai_extraction_record_id ? (
                <>Provenance: AI Record {draft.provenance.ai_extraction_record_id} | Doc {draft.provenance.source_document_version_id}</>
              ) : (
                <>Provenance: Manual Entry | Doc {draft.provenance.source_document_version_id}</>
              )}
            </div>
          </div>
          <div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              draft.status === "APPROVED" ? "bg-green-100 text-green-800" :
              draft.status === "REJECTED" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            }`}>
              {draft.status}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Attributes</label>
          {isEditing ? (
            <textarea
              rows={4}
              value={editAttributes}
              onChange={(e) => setEditAttributes(e.target.value)}
              className="w-full font-mono text-sm border border-blue-500 rounded p-2"
            />
          ) : (
            <pre className="bg-gray-50 p-3 rounded text-sm font-mono overflow-x-auto text-gray-800 border border-gray-100">
              {typeof draft.attributes === "string" ? draft.attributes : JSON.stringify(draft.attributes, null, 2)}
            </pre>
          )}
        </div>

        {draft.rejection_reason && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            <strong>Rejection Reason:</strong> {draft.rejection_reason}
          </div>
        )}
        
        {draft.reviewed_at && (
          <div className="text-xs text-gray-500 mb-4">
            Reviewed at: {new Date(draft.reviewed_at).toLocaleString()}
          </div>
        )}

        {isNeedsReview && (
          <div className="flex space-x-3 mt-4 border-t border-gray-100 pt-4">
            {isEditing ? (
              <>
                <button onClick={() => handleSave(draft.id)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save Changes</button>
                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300">Cancel</button>
              </>
            ) : isRejecting ? (
              <div className="flex-1">
                <textarea
                  placeholder="Reason for rejection (required)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border border-red-300 rounded p-2 text-sm mb-2"
                />
                <div className="flex space-x-2">
                  <button onClick={() => handleReject(draft.id)} className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">Confirm Reject</button>
                  <button onClick={() => setRejectingId(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => startEdit(draft)} className="px-4 py-2 border border-blue-600 text-blue-600 rounded text-sm hover:bg-blue-50">Edit</button>
                <button onClick={() => handleApprove(draft.id)} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">Approve</button>
                <button onClick={() => setRejectingId(draft.id)} className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">Reject</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/vendor/catalogs" className="text-blue-600 hover:underline text-sm font-medium">← Back to Catalogs</Link>
          <span className="font-bold text-gray-700">Draft Review UI</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-6">Review Catalog Drafts</h1>
        
        {msg && (
          <div className={`mb-6 p-4 rounded text-sm ${msg.type === "success" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"} border`}>
            {msg.text}
          </div>
        )}

        <div className="flex justify-end mb-6">
          <button 
            onClick={() => setShowManualAdd(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            + Add Item Manually
          </button>
        </div>

        {showManualAdd && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg border">
              <h3 className="text-xl font-bold mb-4">Add Manual Catalog Item</h3>
              <form onSubmit={handleAddManualItem}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={manualProductName}
                    onChange={(e) => setManualProductName(e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. Paracetamol 500mg"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attributes (JSON)</label>
                  <textarea
                    rows={5}
                    value={manualAttributes}
                    onChange={(e) => setManualAttributes(e.target.value)}
                    className="w-full font-mono text-sm border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={'{\n  "sku": "12345",\n  "price": 15.50\n}'}
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button type="button" onClick={() => setShowManualAdd(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300">
                    Cancel
                  </button>
                  <button type="submit" disabled={addingManual} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                    {addingManual ? "Adding..." : "Add Item"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center p-8 text-gray-500">Loading drafts...</div>
        ) : drafts.length === 0 ? (
          <div className="text-center p-8 bg-white rounded shadow text-gray-500 border border-gray-200">
            No drafts found for this catalog.
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Needs Review</h2>
              {drafts.filter(d => d.status === "NEEDS_REVIEW").length === 0 && <p className="text-sm text-gray-500">No drafts pending review.</p>}
              {drafts.filter(d => d.status === "NEEDS_REVIEW").map(renderDraft)}
            </section>
            
            <section>
              <h2 className="text-xl font-bold mb-4 text-green-800 border-b border-green-200 pb-2">Approved</h2>
              {drafts.filter(d => d.status === "APPROVED").length === 0 && <p className="text-sm text-gray-500">No approved drafts.</p>}
              {drafts.filter(d => d.status === "APPROVED").map(renderDraft)}
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 text-red-800 border-b border-red-200 pb-2">Rejected</h2>
              {drafts.filter(d => d.status === "REJECTED").length === 0 && <p className="text-sm text-gray-500">No rejected drafts.</p>}
              {drafts.filter(d => d.status === "REJECTED").map(renderDraft)}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
