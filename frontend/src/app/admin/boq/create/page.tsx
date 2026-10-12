"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api/client";

interface ExtractedItem {
  item_code?: string;
  item_name: string;
  specifications?: string;
  quantity: number;
  uom: string;
  category?: string;
  target_price?: number;
  attributes?: Record<string, string>;
}

const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024; // 7 MB limit

export default function CreateBOQPage() {
  const router = useRouter();

  // Basic Information
  const [title, setTitle] = useState("");
  const [tenderNumber, setTenderNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [boqType, setBoqType] = useState<"COMMERCIAL" | "TECHNICAL" | "TECHNOCOMMERCIAL">("COMMERCIAL");
  const [deadlineDays, setDeadlineDays] = useState(3);
  const [targetAudience, setTargetAudience] = useState<"ALL_APPROVED" | "SELECTED_VENDORS">("ALL_APPROVED");

  // Ingestion Mode: "FILE" | "PASTE" | "MANUAL"
  const [inputTab, setInputTab] = useState<"FILE" | "PASTE" | "MANUAL">("FILE");
  const [rawText, setRawText] = useState("");
  const [isParsingText, setIsParsingText] = useState(false);

  // Line items state
  const [items, setItems] = useState<ExtractedItem[]>([
    { item_code: "ITEM-001", item_name: "", quantity: 1, uom: "Nos", specifications: "" }
  ]);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [documentVersionId, setDocumentVersionId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Status & Loaders
  const [uploading, setUploading] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Add column state
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Upload Handler
  const handleFileUpload = async (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File "${selectedFile.name}" (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds 7 MB.`);
      return;
    }

    setError(null);
    setUploading(true);
    setExtractionMsg("Analyzing document and extracting line items...");
    setUploadedFileName(selectedFile.name);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("boq_type", boqType);

      const res = await fetchApi("/api/v1/admin/boq/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "AI Extraction failed.");
      }

      const result = await res.json();
      const data = result.data;

      if (result.document_version_id) {
        setDocumentVersionId(result.document_version_id);
      }

      if (!title) setTitle(data.title || selectedFile.name.replace(/\.[^/.]+$/, ""));
      if (!tenderNumber) setTenderNumber(data.tender_number || `JECRC/2026/${Math.floor(100 + Math.random() * 900)}`);
      if (!department) setDepartment(data.department || "Procurement & Operations");
      if (!description) setDescription(data.description || `Extracted from ${selectedFile.name}`);

      if (data.custom_columns && data.custom_columns.length > 0) {
        setCustomColumns(data.custom_columns);
      }
      if (data.items && data.items.length > 0) {
        setItems(data.items);
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse document.");
    } finally {
      setUploading(false);
      setExtractionMsg(null);
    }
  };

  // Raw Text Parse Handler
  const handleParseRawText = async () => {
    if (!rawText.trim()) {
      setError("Please paste or write requisition text first.");
      return;
    }
    setError(null);
    setIsParsingText(true);

    try {
      const res = await fetchApi("/api/v1/admin/boq/parse-text", {
        method: "POST",
        body: JSON.stringify({
          raw_text: rawText,
          boq_type: boqType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to parse text.");
      }

      const result = await res.json();
      const data = result.data;

      if (!title && data.title) setTitle(data.title);
      if (!department && data.department) setDepartment(data.department);
      if (!description && data.description) setDescription(data.description);

      if (data.custom_columns && data.custom_columns.length > 0) {
        setCustomColumns(data.custom_columns);
      }
      if (data.items && data.items.length > 0) {
        setItems(data.items);
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse text.");
    } finally {
      setIsParsingText(false);
    }
  };

  // Table Editing Shortcuts
  const handleAutoNumberCodes = () => {
    setItems(items.map((it, idx) => ({
      ...it,
      item_code: `ITEM-${String(idx + 1).padStart(3, "0")}`
    })));
  };

  const handleSetAllUOM = (uomVal: string) => {
    setItems(items.map((it) => ({ ...it, uom: uomVal })));
  };

  const handleCleanEmptyRows = () => {
    const cleaned = items.filter((it) => (it.item_name || "").trim() !== "");
    setItems(cleaned.length > 0 ? cleaned : [{ item_code: "ITEM-001", item_name: "", quantity: 1, uom: "Nos" }]);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        item_code: `ITEM-${String(items.length + 1).padStart(3, "0")}`,
        item_name: "",
        quantity: 1,
        uom: items[0]?.uom || "Nos",
        specifications: "",
        attributes: {},
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
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
    const validItems = items.filter((it) => (it.item_name || "").trim() !== "");
    if (validItems.length === 0) {
      setError("Please add at least one item with a name.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const payload = {
        title,
        tender_number: tenderNumber || `JECRC/2026/${Math.floor(100 + Math.random() * 900)}`,
        department: department || "Procurement",
        description: description || undefined,
        custom_columns: customColumns,
        items: validItems.map((it) => ({
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
        deadline_days: deadlineDays,
        allow_download: true,
        publish_now: publishNow,
        boq_type: boqType,
        document_version_id: documentVersionId || undefined,
      };

      const res = await fetchApi("/api/v1/admin/boq", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
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
    <div className="max-w-6xl mx-auto space-y-6 text-slate-900 pb-24 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link href="/admin/boq" className="text-xs font-semibold text-blue-600 hover:underline mb-1 inline-block">
            ← Back to All BOQs
          </Link>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Create & Publish BOQ Tender</h1>
          <p className="text-xs text-slate-500">
            Define requirements, upload/paste scope or items, and publish for vendor bidding.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={publishing || uploading}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            disabled={uploading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-all flex items-center space-x-1.5 shadow-xs"
          >
            <span>👁️</span>
            <span>Preview Tender</span>
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={publishing || uploading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-200 transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            {publishing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Publishing...</span>
              </>
            ) : (
              <span>🚀 Publish BOQ Tender</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-bold text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.xlsx,.xls,.doc,.docx"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* 1. General Tender Information Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span>📋</span>
          <span>1. Tender Details</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700">Tender Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Procurement of Liquid Medical Oxygen (LMO) Plant"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Tender Number</label>
            <input
              type="text"
              value={tenderNumber}
              onChange={(e) => setTenderNumber(e.target.value)}
              placeholder="Auto-generated if blank"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-[11px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Bidding Time Lock (Days)</label>
            <input
              type="number"
              min={1}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value) || 3)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* 2. Items & Requirements Ingestion Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 pt-3 space-x-2 text-xs font-bold">
          <button
            onClick={() => setInputTab("FILE")}
            className={`px-4 py-2.5 rounded-t-xl transition-all flex items-center space-x-2 ${
              inputTab === "FILE"
                ? "bg-white text-blue-700 border-t-2 border-x border-slate-200 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span>📁</span>
            <span>Upload Document (Excel / PDF / Word)</span>
          </button>
          <button
            onClick={() => setInputTab("PASTE")}
            className={`px-4 py-2.5 rounded-t-xl transition-all flex items-center space-x-2 ${
              inputTab === "PASTE"
                ? "bg-white text-blue-700 border-t-2 border-x border-slate-200 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span>📝</span>
            <span>Write / Paste Raw Text</span>
          </button>
          <button
            onClick={() => setInputTab("MANUAL")}
            className={`px-4 py-2.5 rounded-t-xl transition-all flex items-center space-x-2 ${
              inputTab === "MANUAL"
                ? "bg-white text-blue-700 border-t-2 border-x border-slate-200 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span>📊</span>
            <span>Direct Table Grid</span>
          </button>
        </div>

        {/* Tab 1: File Upload */}
        {inputTab === "FILE" && (
          <div className="p-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2"
            >
              {uploading ? (
                <>
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xs font-bold text-blue-700">{extractionMsg}</div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl">📄</div>
                  <div className="text-sm font-bold text-slate-800">
                    {uploadedFileName ? `Selected: ${uploadedFileName}` : "Click to select or drag & drop tender file"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Supports Excel (.xlsx, .xls), PDF, Word (.docx) up to 7 MB. Gemini AI will auto-extract items.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Paste Raw Text */}
        {inputTab === "PASTE" && (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Paste Free-Form BOQ or Requisition Text</label>
              <button
                type="button"
                onClick={handleParseRawText}
                disabled={isParsingText || !rawText.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-xs"
              >
                <span>{isParsingText ? "⏳" : "⚡"}</span>
                <span>{isParsingText ? "Parsing with AI..." : "AI Parse into Structured Table"}</span>
              </button>
            </div>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste raw requisition or equipment lines here, e.g.:&#10;1. Basic Price for LMO (Monthly) - 13000 SM3&#10;2. Transportation Charges - 13000 SM3&#10;3. Fixed Facility Charges - 12 Monthly"
              className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 leading-relaxed"
            />
          </div>
        )}

        {/* Line Items Table Editor */}
        <div className="p-5 border-t border-slate-200 space-y-3">
          {/* Table Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-xs font-extrabold text-slate-900">Line Items ({items.length})</span>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleAutoNumberCodes}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
                title="Auto-assign ITEM-001, ITEM-002, ..."
              >
                Auto-Number Codes
              </button>
              <button
                type="button"
                onClick={() => handleSetAllUOM("SM3")}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
              >
                Set SM3
              </button>
              <button
                type="button"
                onClick={() => handleSetAllUOM("Nos")}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
              >
                Set Nos
              </button>
              <button
                type="button"
                onClick={handleCleanEmptyRows}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold transition-colors"
              >
                Clean Empty
              </button>
            </div>

            <div className="flex items-center space-x-2">
              {!showAddCol ? (
                <button
                  type="button"
                  onClick={() => setShowAddCol(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  + Custom Column
                </button>
              ) : (
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="Column Name"
                    className="text-[11px] px-2 py-1 border border-slate-300 rounded-lg w-28"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomColumn}
                    className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-bold"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCol(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors"
              >
                + Add Row
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-2.5 w-10 text-center">#</th>
                  <th className="p-2.5 w-24">Item Code</th>
                  <th className="p-2.5 min-w-[200px]">Item Description <span className="text-red-500">*</span></th>
                  <th className="p-2.5 w-20 text-center">Qty</th>
                  <th className="p-2.5 w-20 text-center">UOM</th>
                  <th className="p-2.5 w-28">Est. Unit Rate</th>
                  {customColumns.map((col) => (
                    <th key={col} className="p-2.5 min-w-[120px]">
                      <div className="flex items-center justify-between">
                        <span>{col}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomColumn(col)}
                          className="text-slate-400 hover:text-red-500 ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="p-2.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-medium">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.item_code || ""}
                        onChange={(e) => handleItemChange(idx, "item_code", e.target.value)}
                        placeholder={`ITEM-${String(idx + 1).padStart(3, "0")}`}
                        className="w-full text-[11px] font-mono px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.item_name}
                        onChange={(e) => handleItemChange(idx, "item_name", e.target.value)}
                        placeholder="e.g. Basic Price for LMO"
                        className="w-full text-xs font-semibold px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 text-slate-800"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", Number(e.target.value) || 0)}
                        className="w-full text-xs text-center px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="text"
                        value={item.uom}
                        onChange={(e) => handleItemChange(idx, "uom", e.target.value)}
                        placeholder="SM3"
                        className="w-full text-xs text-center px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.target_price || ""}
                        onChange={(e) => handleItemChange(idx, "target_price", e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="₹ Optional"
                        className="w-full text-xs px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    {customColumns.map((col) => (
                      <td key={col} className="p-2">
                        <input
                          type="text"
                          value={item.attributes?.[col] || ""}
                          onChange={(e) => handleAttributeChange(idx, col, e.target.value)}
                          className="w-full text-xs px-2 py-1 border border-slate-200 rounded-lg"
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length <= 1}
                        className="text-slate-300 hover:text-red-500 disabled:opacity-20 text-sm font-bold transition-colors"
                        title="Delete line"
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
      </div>

      {/* Bottom Publish Bar */}
      <div className="flex items-center justify-between bg-slate-900 text-white p-4 rounded-2xl shadow-lg">
        <div>
          <div className="text-xs font-bold">Ready to publish?</div>
          <div className="text-[11px] text-slate-400">Total {items.filter(i => i.item_name.trim()).length} line items configured</div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={publishing || uploading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            disabled={uploading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <span>👁️</span>
            <span>Preview Tender</span>
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={publishing || uploading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-blue-900/40 flex items-center space-x-2"
          >
            {publishing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Publishing Tender...</span>
              </>
            ) : (
              <span>🚀 Publish BOQ Tender</span>
            )}
          </button>
        </div>
      </div>

      {/* Tender Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <span className="p-2 bg-blue-600/30 text-blue-400 rounded-xl text-lg">👁️</span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs uppercase tracking-wider font-semibold text-blue-400">Pre-Publication Preview</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded-full border border-amber-500/30">DRAFT</span>
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{title || "Untitled Tender"}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-lg transition-colors"
                title="Close Preview"
              >
                ✕
              </button>
            </div>

            {/* Modal Subheader / Metadata Stats */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tender Ref #</span>
                <span className="font-mono font-bold text-slate-800">{tenderNumber || "Auto-assigned"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Bidding Lock</span>
                <span className="font-semibold text-slate-700">{deadlineDays} Days after publishing</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Valid Items</span>
                <span className="font-bold text-blue-600">{items.filter(i => (i.item_name || "").trim()).length} Items</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Source Document</span>
                <span className="font-medium text-slate-700 truncate block" title={uploadedFileName || "Manual Entry"}>
                  {uploadedFileName ? `📄 ${uploadedFileName}` : "Direct Input"}
                </span>
              </div>
            </div>

            {description && (
              <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100 text-xs text-slate-600 flex items-start space-x-2">
                <span className="text-blue-500 font-bold mt-0.5">ℹ️</span>
                <p className="line-clamp-2">{description}</p>
              </div>
            )}

            {/* Modal Body - Items Table */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Itemized Technical Schedule</h3>
                <span className="text-[11px] text-slate-400">This is exactly what invited vendors will bid against</span>
              </div>

              {items.filter(i => (i.item_name || "").trim()).length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No line items added yet. Please add items before previewing.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-2.5 text-center w-12">#</th>
                        <th className="p-2.5 w-24">Item Code</th>
                        <th className="p-2.5 min-w-[200px]">Item Description & Specifications</th>
                        <th className="p-2.5 text-center w-20">Quantity</th>
                        <th className="p-2.5 text-center w-16">UOM</th>
                        {items.some(i => i.target_price) && (
                          <th className="p-2.5 text-right w-24">Est. Rate</th>
                        )}
                        {customColumns.map(col => (
                          <th key={col} className="p-2.5">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items
                        .filter(i => (i.item_name || "").trim())
                        .map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2.5 text-center font-mono text-slate-400 font-semibold">{idx + 1}</td>
                            <td className="p-2.5 font-mono text-[11px] font-bold text-slate-600">{item.item_code || `ITM-${String(idx + 1).padStart(3, "0")}`}</td>
                            <td className="p-2.5">
                              <div className="font-bold text-slate-900">{item.item_name}</div>
                              {item.specifications && (
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed whitespace-pre-wrap">{item.specifications}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-blue-700">{item.quantity}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium text-[10px] uppercase">{item.uom}</span>
                            </td>
                            {items.some(i => i.target_price) && (
                              <td className="p-2.5 text-right font-mono text-slate-700 font-medium">
                                {item.target_price ? `₹${item.target_price.toLocaleString("en-IN")}` : "-"}
                              </td>
                            )}
                            {customColumns.map(col => (
                              <td key={col} className="p-2.5 text-slate-600 text-[11px]">{item.attributes?.[col] || "-"}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                ← Back to Edit
              </button>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    handleSubmit(false);
                  }}
                  disabled={publishing || uploading}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    handleSubmit(true);
                  }}
                  disabled={publishing || uploading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center space-x-2"
                >
                  {publishing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <span>🚀 Confirm & Publish Live Now</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
