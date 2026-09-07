"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api/client";

interface ExtractedItem {
  item_code: string;
  item_name: string;
  specifications: string;
  quantity: number;
  uom: string;
  category?: string;
  target_price?: number;
  attributes: Record<string, string>;
}

interface VendorOrg {
  id: string;
  legal_name: string;
  status: string;
  primary_email?: string;
  organization_type?: string;
}

export default function CreateUniversalBOQPage() {
  const router = useRouter();

  // Step state: 1 = Ingestion / Upload Mode, 2 = Review Items & Dynamic Columns / Publishing Settings
  const [step, setStep] = useState<1 | 2>(1);

  // Ingestion State
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"DIRECT" | "AI" | null>(null);

  // Form & Items State
  const [title, setTitle] = useState("");
  const [tenderNumber, setTenderNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [documentVersionId, setDocumentVersionId] = useState<string | null>(null);

  // New Custom Column Input
  const [newColName, setNewColName] = useState("");
  const [showAddCol, setShowAddCol] = useState(false);

  // Publishing & Time-Lock Settings
  const [targetAudience, setTargetAudience] = useState<"ALL_APPROVED" | "SELECTED_VENDORS">("ALL_APPROVED");
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [approvedVendors, setApprovedVendors] = useState<VendorOrg[]>([]);
  const [deadlineDays, setDeadlineDays] = useState<number>(3); // 3-Day Default Time-Lock
  const [allowDownload, setAllowDownload] = useState<boolean>(true);
  const [publishing, setPublishing] = useState(false);

  const directFileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  // Load approved vendors for targeting
  useEffect(() => {
    async function loadVendors() {
      try {
        const res = await fetchApi("/api/v1/admin/vendors");
        if (res.ok) {
          const data = await res.json();
          const approved = (Array.isArray(data) ? data : data.vendors || []).filter(
            (v: any) => v.status === "APPROVED"
          );
          setApprovedVendors(approved);
        }
      } catch (e) {
        console.error("Could not fetch vendors:", e);
      }
    }
    loadVendors();
  }, []);

  // OPTION 1: Direct File Upload for Vendors (PDF, Excel, Word DOC/DOCX)
  const handleDirectUpload = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setUploading(true);
    setUploadMode("DIRECT");
    setExtractionMsg("Uploading tender document for direct vendor download...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetchApi("/api/v1/admin/boq/upload-document", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "File upload failed.");
      }

      const result = await res.json();
      if (result.document_version_id) {
        setDocumentVersionId(result.document_version_id);
      }

      const cleanTitle = selectedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(cleanTitle);
      setTenderNumber(`JECRC/2026/${Math.floor(100 + Math.random() * 900)}`);
      setDepartment("Medical & Engineering Infrastructure");
      setDescription(`Attached Tender Document: ${selectedFile.name}. Vendors can download the original file to view specs and place bids.`);
      setCustomColumns([]);
      setItems([
        {
          item_code: "1",
          item_name: `Complete Project BOQ as per attached document (${selectedFile.name})`,
          specifications: `Vendors must download attached file "${selectedFile.name}" for itemized specifications and submit total lump-sum or line quote.`,
          quantity: 1,
          uom: "Job/Lot",
          category: "Attached BOQ Document",
          attributes: {},
        },
      ]);

      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to upload document.");
    } finally {
      setUploading(false);
      setExtractionMsg(null);
      setUploadMode(null);
    }
  };

  // OPTION 2: AI Automated Extraction (Gemini AI parsing table & custom columns)
  const handleAIExtract = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setUploading(true);
    setUploadMode("AI");
    setExtractionMsg("Gemini AI is analyzing document structure, headers, and extracting table items...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetchApi("/api/v1/admin/boq/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "AI Extraction failed.");
      }

      const result = await res.json();
      const data = result.data;

      if (result.document_version_id) {
        setDocumentVersionId(result.document_version_id);
      }

      setTitle(data.title || selectedFile.name.replace(/\.[^/.]+$/, ""));
      setTenderNumber(data.tender_number || `JECRC/2026/${Math.floor(100 + Math.random() * 900)}`);
      setDepartment(data.department || "Medical Equipment & Infrastructure");
      setDescription(data.description || `Extracted from ${selectedFile.name}`);
      setCustomColumns(data.custom_columns || []);
      setItems(data.items || []);

      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to extract BOQ.");
    } finally {
      setUploading(false);
      setExtractionMsg(null);
      setUploadMode(null);
    }
  };

  // Manual Add Blank Item
  const handleAddItem = () => {
    const nextIdx = items.length + 1;
    const blankAttrs: Record<string, string> = {};
    customColumns.forEach((c) => (blankAttrs[c] = ""));

    setItems([
      ...items,
      {
        item_code: String(nextIdx),
        item_name: "",
        specifications: "",
        quantity: 1,
        uom: "Nos",
        category: department || "General",
        target_price: undefined,
        attributes: blankAttrs,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const handleItemChange = (index: number, field: keyof ExtractedItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleAttributeChange = (index: number, colName: string, value: string) => {
    const updated = [...items];
    const currentAttrs = { ...(updated[index].attributes || {}) };
    currentAttrs[colName] = value;
    updated[index].attributes = currentAttrs;
    setItems(updated);
  };

  const handleAddCustomColumn = () => {
    if (!newColName.trim()) return;
    const colTrimmed = newColName.trim();
    if (!customColumns.includes(colTrimmed)) {
      setCustomColumns([...customColumns, colTrimmed]);
    }
    setNewColName("");
    setShowAddCol(false);
  };

  const handleRemoveCustomColumn = (colName: string) => {
    setCustomColumns(customColumns.filter((c) => c !== colName));
  };

  // Submit Handler
  const handleSubmit = async (publishNow: boolean) => {
    if (!title.trim()) {
      setError("Please provide a Tender Title.");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one BOQ line item.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const payload = {
        title,
        tender_number: tenderNumber || undefined,
        department: department || undefined,
        description: description || undefined,
        custom_columns: customColumns,
        items: items.map((it) => ({
          item_code: it.item_code,
          item_name: it.item_name,
          specifications: it.specifications,
          quantity: Number(it.quantity) || 1.0,
          uom: it.uom || "Nos",
          category: it.category,
          target_price: it.target_price ? Number(it.target_price) : undefined,
          attributes: it.attributes || {},
        })),
        target_audience: targetAudience,
        selected_vendor_ids: targetAudience === "SELECTED_VENDORS" ? selectedVendorIds : [],
        deadline_days: deadlineDays,
        allow_download: allowDownload,
        publish_now: publishNow,
        document_version_id: documentVersionId || undefined,
      };

      const res = await fetchApi("/api/v1/admin/boq", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save BOQ.");
      }

      const data = await res.json();
      router.push(`/admin/boq/${data.boq_id}`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 text-slate-900 pb-20 font-sans">
      {/* Top Breadcrumb & Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Link href="/admin/boq" className="text-xs font-semibold text-blue-600 hover:underline mb-1 inline-block">
            ← Back to All BOQs
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create & Publish Universal BOQ Tender</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose how to build your tender: Attach files directly for vendors, use Gemini AI table extraction, or create manually.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setStep(1)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              step === 1 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            1. Select Creation Method
          </button>
          <span className="text-slate-300">→</span>
          <button
            onClick={() => setStep(2)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              step === 2 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            2. Review & Publish
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={directFileInputRef}
        accept=".pdf,.xlsx,.xls,.doc,.docx"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleDirectUpload(e.target.files[0]);
          }
        }}
        className="hidden"
      />
      <input
        type="file"
        ref={aiFileInputRef}
        accept=".pdf,.xlsx,.xls,.doc,.docx"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleAIExtract(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* STEP 1: 3 CREATION OPTIONS GRID */}
      {step === 1 && (
        <div className="space-y-6">
          {uploading ? (
            <div className="bg-white rounded-2xl border-2 border-blue-200 p-12 text-center shadow-md flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <h3 className="text-base font-bold text-slate-900">
                {uploadMode === "DIRECT" ? "Uploading Document..." : "Processing Document with Gemini AI..."}
              </h3>
              <p className="text-xs font-medium text-blue-700 max-w-md">{extractionMsg}</p>
              <span className="text-[11px] text-slate-400">Please wait while your document is being prepared.</span>
            </div>
          ) : (
            <div>
              <div className="text-center max-w-xl mx-auto mb-8">
                <h2 className="text-lg font-bold text-slate-900">Select How You Want to Create This BOQ Tender</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Upload files directly for vendor download, let AI extract line items into an online table, or build from scratch.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* OPTION 1: Direct File Upload */}
                <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-500 transition-all p-6 shadow-xs flex flex-col justify-between group">
                  <div>
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 text-2xl border border-emerald-100 group-hover:scale-105 transition-transform">
                      📄
                    </div>
                    <span className="inline-block px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full mb-2 uppercase tracking-wide">
                      Option A: Fast Upload
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mb-2">
                      Upload File for Vendor Download
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6">
                      Upload any <strong>PDF, Excel (.xlsx/.xls), or Word (.doc/.docx)</strong> file directly. Vendors can download the original attached document to view specs and submit quotes without waiting for AI parsing.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => directFileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <span>📎 Upload Document (.pdf, .xlsx, .doc)</span>
                  </button>
                </div>

                {/* OPTION 2: AI Table Extraction */}
                <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-500 transition-all p-6 shadow-xs flex flex-col justify-between group relative overflow-hidden">
                  <div className="absolute -top-3 -right-3 bg-blue-600 text-white text-[9px] font-bold px-3 py-1.5 rotate-12 rounded-full uppercase tracking-widest shadow-xs">
                    AI Powered
                  </div>
                  <div>
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 text-2xl border border-blue-100 group-hover:scale-105 transition-transform">
                      ⚡
                    </div>
                    <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full mb-2 uppercase tracking-wide">
                      Option B: Gemini AI Parse
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mb-2">
                      AI Extraction & Interactive Form
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6">
                      Upload PDF or Excel document. <strong>Gemini AI automatically extracts all line items</strong>, specifications, units, and custom project columns into an interactive online table grid (while ALSO attaching the original document!).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => aiFileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <span>✨ Extract with Gemini AI</span>
                  </button>
                </div>

                {/* OPTION 3: Create Manually */}
                <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-500 transition-all p-6 shadow-xs flex flex-col justify-between group">
                  <div>
                    <div className="w-12 h-12 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center mb-4 text-2xl border border-slate-200 group-hover:scale-105 transition-transform">
                      ✍️
                    </div>
                    <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full mb-2 uppercase tracking-wide">
                      Option C: Manual Entry
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mb-2">
                      Create Form Manually
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6">
                      Start from scratch without uploading a file. Build custom tender line items, add dynamic project columns, and specify item quantities directly in the web editor.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle("New Procurement Tender");
                      setTenderNumber(`JECRC/2026/${Math.floor(100 + Math.random() * 900)}`);
                      setDepartment("Medical Equipment & Infrastructure");
                      setDescription("Custom procurement tender created manually.");
                      setCustomColumns(["Location", "Scope"]);
                      setItems([
                        {
                          item_code: "1",
                          item_name: "Sample Equipment / Item Name",
                          specifications: "Enter specification details here...",
                          quantity: 1,
                          uom: "Nos",
                          category: "General",
                          attributes: { Location: "Main Building", Scope: "Supply & Installation" },
                        },
                      ]);
                      setStep(2);
                    }}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <span>✏️ Create Blank Form Manually</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: REVIEW ITEMS, DYNAMIC COLUMNS & PUBLISHING */}
      {step === 2 && (
        <div className="space-y-8">
          {documentVersionId && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <span className="text-base">📎</span>
                <div>
                  <span className="font-bold block">Source Tender Document Attached</span>
                  <span className="text-[11px] text-emerald-700">
                    {file ? file.name : "Document File"} is stored and attached. Vendors will be able to download this file directly.
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-200 text-emerald-900 font-bold rounded-lg text-[10px]">
                Attached
              </span>
            </div>
          )}

          {/* Metadata Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Tender Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Radiology Dept Equipment & Machines"
                className="w-full text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Tender Reference Number
              </label>
              <input
                type="text"
                value={tenderNumber}
                onChange={(e) => setTenderNumber(e.target.value)}
                placeholder="e.g. JECRC/2026/RAD/001"
                className="w-full text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Department / Category
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Radiology, MGPS, Biomedical"
                className="w-full text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Tender Description / Scope Overview
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Provide summary instructions or scope details for participating vendors..."
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Dynamic Custom Columns Management */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Dynamic Project Columns (Format-Agnostic)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  These custom columns were extracted from the tender layout. You can add or remove columns freely to fit any project requirement.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {showAddCol ? (
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="e.g. Approved Makes"
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-hidden"
                      onKeyDown={(e) => e.key === "Enter" && handleAddCustomColumn()}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomColumn}
                      className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCol(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddCol(true)}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all shadow-xs"
                  >
                    <span>+ Add Custom Column</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {customColumns.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No custom columns. Only standard line item fields will be used.</span>
              ) : (
                customColumns.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center space-x-1.5 bg-white text-slate-800 text-xs font-semibold px-3 py-1 rounded-lg border border-slate-200 shadow-xs"
                  >
                    <span>{col}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomColumn(col)}
                      className="text-slate-400 hover:text-red-500 font-bold ml-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  BOQ Line Items ({items.length})
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Click any cell to edit specifications, quantities, or custom attributes.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                + Add Line Item
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 w-16 text-center">Code</th>
                    <th className="px-3 py-3 min-w-[200px]">Item / Equipment Name</th>
                    <th className="px-3 py-3 min-w-[240px]">Specifications / Description</th>
                    <th className="px-3 py-3 w-20 text-center">Qty</th>
                    <th className="px-3 py-3 w-20 text-center">UOM</th>
                    {customColumns.map((col) => (
                      <th key={col} className="px-3 py-3 min-w-[140px] text-slate-700 bg-blue-50/50">
                        {col}
                      </th>
                    ))}
                    <th className="px-3 py-3 w-12 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      {/* Code */}
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={it.item_code}
                          onChange={(e) => handleItemChange(idx, "item_code", e.target.value)}
                          className="w-full text-center px-1 py-1 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 font-mono text-xs bg-transparent"
                        />
                      </td>

                      {/* Name */}
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={it.item_name}
                          onChange={(e) => handleItemChange(idx, "item_name", e.target.value)}
                          className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 font-semibold text-slate-900 bg-transparent text-xs"
                        />
                      </td>

                      {/* Specs */}
                      <td className="px-2 py-2">
                        <textarea
                          value={it.specifications}
                          onChange={(e) => handleItemChange(idx, "specifications", e.target.value)}
                          rows={1}
                          className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 text-slate-600 bg-transparent text-xs resize-y"
                        />
                      </td>

                      {/* Qty */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="any"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                          className="w-full text-center px-1 py-1 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 font-semibold text-xs bg-transparent"
                        />
                      </td>

                      {/* UOM */}
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={it.uom}
                          onChange={(e) => handleItemChange(idx, "uom", e.target.value)}
                          className="w-full text-center px-1 py-1 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 text-xs bg-transparent"
                        />
                      </td>

                      {/* Custom Columns */}
                      {customColumns.map((col) => (
                        <td key={col} className="px-2 py-2 bg-blue-50/20">
                          <input
                            type="text"
                            value={it.attributes?.[col] || ""}
                            onChange={(e) => handleAttributeChange(idx, col, e.target.value)}
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-blue-300 focus:border-blue-500 text-slate-700 bg-transparent text-xs"
                          />
                        </td>
                      ))}

                      {/* Remove */}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-300 hover:text-red-600 font-bold text-sm"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* STEP 3: PUBLISHING SETTINGS CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Tender Publishing & Time-Lock Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target Audience */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  1. Target Audience:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="targetAudience"
                      checked={targetAudience === "ALL_APPROVED"}
                      onChange={() => setTargetAudience("ALL_APPROVED")}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">All Approved Vendors (Recommended)</span>
                      <span className="text-[11px] text-slate-500">Every verified vendor organization will see and receive email notification.</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="targetAudience"
                      checked={targetAudience === "SELECTED_VENDORS"}
                      onChange={() => setTargetAudience("SELECTED_VENDORS")}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Selected Vendors Only</span>
                      <span className="text-[11px] text-slate-500">Restrict access to specific invited vendors.</span>
                    </div>
                  </label>
                </div>

                {targetAudience === "SELECTED_VENDORS" && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto space-y-2 text-xs">
                    {approvedVendors.length === 0 ? (
                      <p className="text-slate-400">No approved vendors found.</p>
                    ) : (
                      approvedVendors.map((v) => (
                        <label key={v.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedVendorIds.includes(v.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedVendorIds([...selectedVendorIds, v.id]);
                              } else {
                                setSelectedVendorIds(selectedVendorIds.filter((id) => id !== v.id));
                              }
                            }}
                          />
                          <span className="font-semibold text-slate-800">{v.legal_name}</span>
                          <span className="text-slate-400">({v.organization_type || "Vendor"})</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Time-Lock Window */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  2. Time-Lock Window (Bidding Countdown Deadline):
                </label>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[3, 5, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDeadlineDays(days)}
                      className={`p-3 text-center rounded-xl border font-bold text-xs transition-all ${
                        deadlineDays === days
                          ? "bg-blue-50 border-blue-600 text-blue-700 ring-2 ring-blue-500/20 shadow-xs"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="text-base font-black">{days} Days</div>
                      <span className="text-[10px] font-normal text-slate-500">
                        {days === 3 ? "Standard Lock" : "Extended"}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Allow Download Toggle */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Allow Excel Template Download</span>
                    <span className="text-[11px] text-slate-500">Enable vendors to download pre-formatted bidding spreadsheet</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowDownload}
                      onChange={(e) => setAllowDownload(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={publishing}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-colors"
              >
                Save as Draft (Unpublished)
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={publishing}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <span>🚀 Publish & Notify Vendors ({deadlineDays} Days Lock)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
