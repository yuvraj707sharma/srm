"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

interface DocumentVersion {
  id: string;
  version_number: number;
  original_filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface DocumentItem {
  id: string;
  document_type: string;
  status: string;
  created_at: string;
  latest_version?: DocumentVersion;
}

export default function MinimalWhiteVendorDocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("PAN");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { logout } = useAuth();

  const isLocked = Boolean(profile && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(profile.status));

  const loadDocs = async () => {
    try {
      setLoading(true);
      const res = await fetchApi("/api/v1/vendor/documents");
      if (res.ok) {
        setDocuments(await res.json());
      }
      const profRes = await fetchApi("/api/v1/vendor/me");
      if (profRes.ok) {
        const prof = await profRes.json();
        setProfile(prof);
        if (prof.status !== "APPROVED") {
          router.push("/vendor/profile");
          return;
        }
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error loading documents." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked && selectedDocType !== "PRODUCT_CATALOG") {
      setMsg({ type: "error", text: "Compliance document uploads are locked while profile is under review or approved." });
      return;
    }
    if (!selectedFile) {
      setMsg({ type: "error", text: "Please select a file to upload." });
      return;
    }

    setUploading(true);
    setMsg(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetchApi(`/api/v1/vendor/documents?document_type=${encodeURIComponent(selectedDocType)}`, {
        method: "POST",
        body: formData,
        headers: {}
      });

      if (res.ok) {
        setMsg({ type: "success", text: `${selectedDocType.replace(/_/g, " ")} uploaded successfully!` });
        setSelectedFile(null);
        loadDocs();
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || "Upload failed." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "An error occurred during upload." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-6">
              <Link href="/vendor/dashboard" className="flex items-center space-x-2.5">
                <div className="bg-blue-600 text-white font-bold text-lg px-2.5 py-1 rounded-lg">J</div>
                <div>
                  <span className="font-bold text-gray-900 tracking-tight text-base block">JECRC SCM</span>
                  <span className="text-[10px] text-gray-500 block -mt-1">Vendor Portal</span>
                </div>
              </Link>

              <div className="hidden md:flex space-x-1 pl-4 border-l border-gray-200 text-xs font-semibold">
                {profile?.status === "APPROVED" && (
                  <Link href="/vendor/dashboard" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                    Dashboard
                  </Link>
                )}
                <Link href="/vendor/profile" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  {profile?.status === "APPROVED" ? "My Profile" : "Vendor Registration"}
                </Link>
                {profile?.status === "APPROVED" && (
                  <>
                    <Link href="/vendor/search" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      BOQ Submissions
                    </Link>
                    <Link href="/vendor/recommendations" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      My Proposals
                    </Link>
                    <Link href="/vendor/documents" className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
                      Documents
                    </Link>
                    <Link href="/vendor/catalogs" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      Product Catalogs (AI)
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={logout}
                className="text-xs text-red-600 hover:text-red-700 font-semibold bg-red-50 border border-red-200 px-3.5 py-2 rounded-lg transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Compliance & Registration Documents</h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your company compliance certificates, balance sheets, PAN/GST records, and non-debarment declarations.
          </p>
        </div>

        {profile?.status === "APPROVED" && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center justify-between shadow-sm text-emerald-900">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">✅</span>
              <div>
                <h3 className="font-bold text-sm">Compliance Documents Approved</h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Your vendor organization has been verified and approved by JECRC Procurement Admin. Compliance document updates are locked.
                </p>
              </div>
            </div>
            <span className="bg-emerald-200 text-emerald-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
              APPROVED
            </span>
          </div>
        )}

        {(profile?.status === "SUBMITTED" || profile?.status === "UNDER_REVIEW") && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center justify-between shadow-sm text-amber-900">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h3 className="font-bold text-sm">Compliance Uploads Under Review</h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your vendor profile is currently under review by JECRC Procurement Admin. Compliance document updates are locked.
                </p>
              </div>
            </div>
            <span className="bg-amber-200 text-amber-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
              {profile?.status}
            </span>
          </div>
        )}

        {msg && (
          <div className={`p-4 rounded-xl text-sm flex items-center space-x-2 ${
            msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            <span>{msg.type === "success" ? "✓" : "⚠️"}</span>
            <span>{msg.text}</span>
          </div>
        )}

        {/* Document Upload Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900">Upload New Document</h2>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Document Type *</label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="PAN">PAN Card Copy</option>
                  <option value="GST">GST Registration Certificate</option>
                  <option value="MSME">MSME/Udyam Certificate</option>
                  <option value="BALANCE_SHEET">Audited Balance Sheet FY 2024-25</option>
                  <option value="CANCELLED_CHEQUE">Cancelled Cheque / Bank Letter</option>
                  <option value="NON_DEBARMENT_DECLARATION">Non-Debarment Declaration</option>
                  <option value="COMPANY_PROFILE">Company Profile / Brochure</option>
                  <option value="PRODUCT_CATALOG">Product Catalog PDF</option>
                  <option value="OTHER">Other Supporting Document</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Select File (PDF, PNG, JPG) *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-700 text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
          </form>
        </div>

        {/* Uploaded Documents List */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900">Uploaded Documents ({documents.length})</h2>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No documents uploaded yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((d) => (
                <div key={d.id} className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-gray-900 text-xs">{d.document_type}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {d.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate">
                    File: {d.latest_version?.original_filename || "Attached"}
                  </p>
                  <span className="text-[10px] text-gray-500 block">
                    Uploaded: {d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
