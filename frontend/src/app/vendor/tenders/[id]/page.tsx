"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api/client";

interface BOQItem {
  id: string;
  item_code?: string;
  item_name: string;
  specifications?: string;
  quantity: number;
  uom: string;
  category?: string;
  attributes: Record<string, string>;
}

interface SubmittedItem {
  submission_item_id: string;
  boq_item_id: string;
  quoted_unit_price: number;
  total_amount: number;
  gst_percent?: number;
  gst_amount?: number;
  make_model_quoted?: string;
  technical_compliance: string;
  vendor_remarks?: string;
}

interface ExistingSubmission {
  id: string;
  status: string;
  submission_type: string;
  submitted_at?: string;
  sub_total: number;
  gst_percent: number;
  gst_amount: number;
  grand_total: number;
  payment_terms?: string;
  delivery_time?: string;
  warranty_terms?: string;
  model_no?: string;
  tank_capacity_location?: string;
  document_version_id?: string;
  extracted_data?: any;
  items: SubmittedItem[];
}

interface TenderDetail {
  id: string;
  tender_number: string;
  title: string;
  department?: string;
  description?: string;
  boq_type?: "COMMERCIAL" | "TECHNICAL" | "TECHNOCOMMERCIAL";
  status: string;
  published_at?: string;
  deadline_at?: string;
  is_deadline_passed: boolean;
  is_locked: boolean;
  can_revise?: boolean;
  remaining_seconds: number;
  allow_download: boolean;
  document_version_id?: string;
  custom_columns: string[];
  items: BOQItem[];
  submission?: ExistingSubmission;
}

interface BidFormItem {
  boq_item_id: string;
  quoted_unit_price: number;
  make_model_quoted: string;
  technical_compliance: string;
  vendor_remarks: string;
  gst_percent: number;
}

export default function VendorTenderBiddingPage() {
  const params = useParams();
  const router = useRouter();
  const boqId = params.id as string;

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Submission Mode: "FORM" | "EXCEL" | "PDF"
  const [activeTab, setActiveTab] = useState<"FORM" | "EXCEL" | "PDF">("FORM");

  // Revision & Draft State
  const [isEditingRevised, setIsEditingRevised] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);

  // Form Submission State
  const [formItems, setFormItems] = useState<Record<string, BidFormItem>>({});
  const [paymentTerms, setPaymentTerms] = useState("30 Days against delivery and acceptance");
  const [deliveryTime, setDeliveryTime] = useState("4 to 6 Weeks from PO");
  const [warrantyTerms, setWarrantyTerms] = useState("Standard 12 Months Comprehensive");

  // Upload Submission State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTender();
    const interval = setInterval(() => {
      setTender((prev) => {
        if (!prev) return prev;
        const newSecs = Math.max(0, prev.remaining_seconds - 1);
        return {
          ...prev,
          remaining_seconds: newSecs,
          is_deadline_passed: newSecs <= 1 ? true : prev.is_deadline_passed,
          is_locked: newSecs <= 1 ? true : prev.is_locked,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [boqId]);

  async function loadTender() {
    try {
      setLoading(true);
      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}`);
      if (!res.ok) {
        throw new Error("Failed to load tender details.");
      }
      const data: TenderDetail = await res.json();
      setTender(data);

      // Pre-fill form inputs from previous submission (DRAFT or SUBMITTED) or default to empty
      const initialForm: Record<string, BidFormItem> = {};
      const subItemsMap = new Map((data.submission?.items || []).map((si) => [si.boq_item_id, si]));

      data.items.forEach((it) => {
        const existing = subItemsMap.get(it.id);
        initialForm[it.id] = {
          boq_item_id: it.id,
          quoted_unit_price: existing ? Number(existing.quoted_unit_price) : 0,
          make_model_quoted: existing?.make_model_quoted || "",
          technical_compliance: existing?.technical_compliance || "COMPLIANT",
          vendor_remarks: existing?.vendor_remarks || "",
          gst_percent: existing?.gst_percent !== undefined ? Number(existing.gst_percent) : 18,
        };
      });
      setFormItems(initialForm);

      if (data.submission) {
        if (data.submission.payment_terms) setPaymentTerms(data.submission.payment_terms);
        if (data.submission.delivery_time) setDeliveryTime(data.submission.delivery_time);
        if (data.submission.warranty_terms) setWarrantyTerms(data.submission.warranty_terms);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "🔒 Time Lock Closed";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `⏳ ${d}d ${h}h ${m}m ${s}s remaining`;
    return `⏳ ${h}h ${m}m ${s}s remaining`;
  };

  // Calculations for manual form
  const calculateFormTotals = () => {
    if (!tender) return { subTotal: 0, gstAmount: 0, grandTotal: 0 };
    let sub = 0;
    let gstTotal = 0;
    tender.items.forEach((it) => {
      const q = formItems[it.id];
      const rate = q ? Number(q.quoted_unit_price) || 0 : 0;
      const gstPct = q ? Number(q.gst_percent ?? 18) : 18;
      const itemSub = rate * it.quantity;
      sub += itemSub;
      gstTotal += itemSub * (gstPct / 100);
    });
    return { subTotal: sub, gstAmount: gstTotal, grandTotal: sub + gstTotal };
  };

  const handleFormItemChange = (itemId: string, field: keyof BidFormItem, value: any) => {
    setFormItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  // Save as Draft (Unsealed)
  const handleSaveDraft = async () => {
    if (!tender) return;
    setSavingDraft(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const itemsPayload = Object.values(formItems).map((it) => ({
        boq_item_id: it.boq_item_id,
        quoted_unit_price: Number(it.quoted_unit_price) || 0,
        make_model_quoted: it.make_model_quoted || undefined,
        technical_compliance: it.technical_compliance || "COMPLIANT",
        vendor_remarks: it.vendor_remarks || undefined,
        gst_percent: it.gst_percent ?? 18,
      }));

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          items: itemsPayload,
          gst_percent: 18.0,
          payment_terms: paymentTerms,
          delivery_time: deliveryTime,
          warranty_terms: warrantyTerms,
          is_draft: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Draft save failed.");
      }

      setSuccessMsg("Draft saved successfully! You can return anytime to continue your quotation before the deadline.");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Bulk Apply GST % to all items
  const handleApplyGstToAll = (pct: number) => {
    setFormItems((prev) => {
      const updated: Record<string, BidFormItem> = {};
      Object.keys(prev).forEach((key) => {
        updated[key] = { ...prev[key], gst_percent: pct };
      });
      return updated;
    });
  };

  // Bulk Mark All items as COMPLIANT
  const handleMarkAllCompliant = () => {
    setFormItems((prev) => {
      const updated: Record<string, BidFormItem> = {};
      Object.keys(prev).forEach((key) => {
        updated[key] = { ...prev[key], technical_compliance: "COMPLIANT" };
      });
      return updated;
    });
  };

  // Submit & Lock via Web Form
  const handleConfirmSubmitForm = async () => {
    if (!tender) return;
    setSubmitting(true);
    setError(null);
    try {
      const itemsPayload = Object.values(formItems).map((it) => ({
        boq_item_id: it.boq_item_id,
        quoted_unit_price: Number(it.quoted_unit_price) || 0,
        make_model_quoted: it.make_model_quoted || undefined,
        technical_compliance: it.technical_compliance || "COMPLIANT",
        vendor_remarks: it.vendor_remarks || undefined,
        gst_percent: it.gst_percent ?? 18,
      }));

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          items: itemsPayload,
          gst_percent: 18.0,
          payment_terms: paymentTerms,
          delivery_time: deliveryTime,
          warranty_terms: warrantyTerms,
          is_draft: false,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Submission failed.");
      }

      setShowConfirmModal(false);
      setIsEditingRevised(false);
      setSuccessMsg("Quotation successfully submitted and sealed for evaluation.");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to submit bid.");
    } finally {
      setSubmitting(false);
    }
  };

  // Preview & Extract File into Form (No DB commit)
  const handleParseFileIntoForm = async (selectedFile: File) => {
    const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024; // 7 MB
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File "${selectedFile.name}" exceeds the maximum allowed limit of 7 MB.`);
      return;
    }

    setParsingFile(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/parse-bid-file`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "File extraction failed.");
      }

      const resData = await res.json();
      const parsedBid = resData.parsed_bid || {};
      const parsedItems: any[] = parsedBid.items || [];

      // Update form items from parsed data
      setFormItems((prev) => {
        const updated = { ...prev };
        parsedItems.forEach((pi) => {
          if (pi.boq_item_id && updated[pi.boq_item_id]) {
            updated[pi.boq_item_id] = {
              ...updated[pi.boq_item_id],
              quoted_unit_price: Number(pi.quoted_unit_price) || updated[pi.boq_item_id].quoted_unit_price,
              make_model_quoted: pi.make_model_quoted || updated[pi.boq_item_id].make_model_quoted,
              technical_compliance: pi.technical_compliance || updated[pi.boq_item_id].technical_compliance,
              vendor_remarks: pi.vendor_remarks || updated[pi.boq_item_id].vendor_remarks,
              gst_percent: pi.gst_percent !== undefined ? Number(pi.gst_percent) : updated[pi.boq_item_id].gst_percent,
            };
          }
        });
        return updated;
      });

      if (parsedBid.payment_terms) setPaymentTerms(parsedBid.payment_terms);
      if (parsedBid.delivery_time) setDeliveryTime(parsedBid.delivery_time);
      if (parsedBid.warranty_terms) setWarrantyTerms(parsedBid.warranty_terms);

      setActiveTab("FORM");
      setSuccessMsg(`Extracted quotation data from "${selectedFile.name}". Please review and verify each line item below before submitting.`);
    } catch (err: any) {
      setError(err.message || "Failed to extract quotation data from file.");
    } finally {
      setParsingFile(false);
      setUploadFile(null);
    }
  };

  // Submit via Direct File Upload (Excel or PDF)
  const handleFileUploadSubmit = async (selectedFile: File) => {
    const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024; // 7 MB
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File "${selectedFile.name}" (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 7 MB.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/upload-bid`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "File processing failed.");
      }

      setIsEditingRevised(false);
      setSuccessMsg("Quotation file uploaded and sealed successfully!");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to upload and submit bid file.");
    } finally {
      setUploading(false);
      setUploadFile(null);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-semibold">Loading Tender Specifications & Bid Lock...</span>
      </div>
    );
  }

  if (error && !tender) {
    return (
      <div className="p-12 text-center text-red-600 max-w-md mx-auto">
        <h3 className="text-lg font-bold">Error Loading Tender</h3>
        <p className="text-xs text-slate-500 mt-1">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg"
        >
          ← Return to Tenders
        </button>
      </div>
    );
  }

  if (!tender) return null;

  const isSubmitted = tender.submission && tender.submission.status === "SUBMITTED";
  const { subTotal, gstAmount, grandTotal } = calculateFormTotals();

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900 pb-20 font-sans">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1 flex-wrap gap-y-1">
            <Link href="/vendor/dashboard" className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">
              🏠 Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <Link href="/vendor/tenders" className="text-xs font-semibold text-blue-600 hover:underline">
              Active Tenders
            </Link>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {tender.tender_number}
            </span>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
              tender.boq_type === "COMMERCIAL"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : tender.boq_type === "TECHNICAL"
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-purple-50 text-purple-800 border-purple-200"
            }`}>
              {tender.boq_type || "COMMERCIAL"} BOQ
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{tender.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Department: <strong>{tender.department || "Medical College Procurement"}</strong> • {tender.items.length} Line Items
            {tender.boq_type === "COMMERCIAL" && (
              <span className="text-amber-700 font-semibold ml-2">
                (Commercial Evaluation: Evaluated on Unit Supply & One-Time Charges)
              </span>
            )}
          </p>
        </div>

        {/* Live Lock Timer Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/vendor/dashboard"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 transition-colors"
            title="Return to Vendor Dashboard"
          >
            <span>🏠</span>
            <span>Dashboard</span>
          </Link>

          {!isSubmitted && !tender.is_deadline_passed && (
            <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                Time-Lock Countdown
              </span>
              <span className="text-xs font-black text-amber-900 animate-pulse">
                {formatCountdown(tender.remaining_seconds)}
              </span>
            </div>
          )}

          {tender.allow_download && (
            <a
              href={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/v1/vendor/tenders/${tender.id}/download-template`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 transition-colors"
            >
              <span>📥</span>
              <span>Download Excel Template (.xlsx)</span>
            </a>
          )}

          {tender.document_version_id && (
            <a
              href={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/v1/vendor/tenders/${tender.id}/document`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs border border-blue-200 transition-colors"
            >
              <span>📄</span>
              <span>Download Original Tender BOQ Document</span>
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 text-xs font-bold">✕</button>
        </div>
      )}

      {/* CASE 1: BID ALREADY SUBMITTED & LOCKED */}
      {isSubmitted && !isEditingRevised && tender.submission ? (
        <div className="space-y-6">
          {/* Lock Banner */}
          <div className="bg-emerald-50 border-2 border-emerald-300/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-7 h-7 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
                  🔒
                </span>
                <h3 className="text-base font-black text-emerald-950">
                  Bid Submitted & Sealed
                </h3>
              </div>
              <p className="text-xs text-emerald-800 mt-1 max-w-xl">
                Your quotation was successfully submitted on{" "}
                <strong>
                  {tender.submission.submitted_at
                    ? new Date(tender.submission.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "record"}
                </strong>
                . Quotes are sealed for tender evaluation.
              </p>

              {tender.submission.document_version_id && (
                <div className="mt-3">
                  <a
                    href={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/v1/vendor/tenders/${tender.id}/submission-document`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold border border-emerald-300 transition-colors shadow-xs"
                  >
                    <span>📥</span>
                    <span>Download Your Submitted Quotation Document</span>
                  </a>
                </div>
              )}

              {tender.can_revise && (
                <div className="mt-4 pt-3 border-t border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-emerald-900">
                    💡 <strong>Need to adjust your quotes?</strong> The tender deadline has not passed. You can revise your quotation anytime before closing.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingRevised(true);
                      setActiveTab("FORM");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5 self-start sm:self-auto"
                  >
                    <span>✏️</span>
                    <span>Revise Quotation</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Quoted Value
              </span>
              <span className="text-2xl font-black text-emerald-950 font-mono">
                ₹{tender.submission.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">
                Includes GST (₹{tender.submission.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
              </span>
            </div>
          </div>

          {/* COMMERCIAL BOQ: Full Commercial Quote Breakdown */}
          {tender.boq_type === "COMMERCIAL" && tender.submission.extracted_data?.commercial_breakdown && (() => {
            const cb = tender.submission.extracted_data.commercial_breakdown;
            const ct = tender.submission.extracted_data.commercial_terms || {};
            return (
              <div className="space-y-4">
                {/* Part 1: Recurring Charges */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                    <span className="text-sm">🔁</span>
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">Part 1 — Recurring Charges</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">Description</th>
                          <th className="px-4 py-2.5 text-right">Rate / Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cb.gas_supply_rate_per_sm3 != null && (
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              Liquid Medical Oxygen — Gas Supply Rate
                              <span className="ml-2 text-[10px] text-slate-400 font-normal">(per SM3)</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-blue-800">
                              ₹{Number(cb.gas_supply_rate_per_sm3).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/SM3
                              {cb.gas_supply_rate_per_kg && (
                                <span className="text-slate-400 font-normal ml-1 text-[10px]">
                                  (₹{Number(cb.gas_supply_rate_per_kg).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/KG)
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                        {cb.monthly_facility_charge != null && (
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">Monthly Facility / Rental Charge</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                              ₹{Number(cb.monthly_facility_charge).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/Month
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">Freight Charges</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            {cb.freight_charges || "NIL"}
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">Taxes & Levies</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">GST Extra (as applicable)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Part 2: One-Time Charges */}
                {cb.one_time_charges && cb.one_time_charges.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
                      <span className="text-sm">🏗️</span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-blue-900">Part 2 — One-Time Charges (SITC / Installation)</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Charge Description</th>
                            <th className="px-4 py-2.5 text-right">Amount (₹)</th>
                            <th className="px-4 py-2.5">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cb.one_time_charges.map((ot: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-semibold text-slate-800">{ot.name}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                ₹{Number(ot.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-slate-500">{ot.remarks || "—"}</td>
                            </tr>
                          ))}
                          <tr className="bg-blue-50 font-black border-t border-blue-200">
                            <td className="px-4 py-3 text-blue-900 uppercase text-[11px]">Total One-Time Cost</td>
                            <td className="px-4 py-3 text-right font-mono text-blue-900">
                              ₹{Number(cb.one_time_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Part 3: Commercial Terms */}
                {Object.keys(ct).some(k => ct[k]) && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="px-5 py-3 bg-purple-50 border-b border-purple-200 flex items-center gap-2">
                      <span className="text-sm">📋</span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-purple-900">Part 3 — Commercial Terms & Conditions</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                      {[
                        { key: "agreement_tenure", label: "Agreement Tenure (LTA)" },
                        { key: "lock_in_period", label: "Lock-In Period" },
                        { key: "payment_terms_gas", label: "Payment Terms (Gas)" },
                        { key: "payment_terms_sitc", label: "Payment Terms (SITC)" },
                        { key: "price_escalation", label: "Price Escalation" },
                        { key: "minimum_expected_volume", label: "Minimum Volume" },
                        { key: "mode_of_delivery", label: "Mode of Delivery" },
                        { key: "civil_work_scope", label: "Civil Work Scope" },
                        { key: "delivery_time", label: "Delivery / Lead Time" },
                      ].filter(f => ct[f.key]).map(f => (
                        <div key={f.key} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">{f.label}</span>
                          <span className="font-bold text-slate-800 text-xs mt-0.5 block">{ct[f.key]}</span>
                        </div>
                      ))}
                      {cb.minimum_volume && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Minimum Volume Commitment</span>
                          <span className="font-bold text-slate-800 text-xs mt-0.5 block">{cb.minimum_volume}</span>
                        </div>
                      )}
                      {tender.submission.payment_terms && !ct["payment_terms_gas"] && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Payment Terms</span>
                          <span className="font-bold text-slate-800 text-xs mt-0.5 block">{tender.submission.payment_terms}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Non-COMMERCIAL: Standard AI Extracted Terms Card */}
          {tender.boq_type !== "COMMERCIAL" && (tender.submission.model_no || tender.submission.tank_capacity_location || tender.submission.payment_terms || tender.submission.delivery_time) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>📑</span>
                <span>AI-Extracted Quotation Intelligence & Commercial Terms</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {tender.submission.model_no && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Quoted Model / Make</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{tender.submission.model_no}</span>
                  </div>
                )}
                {tender.submission.tank_capacity_location && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Tank Capacity & Location</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{tender.submission.tank_capacity_location}</span>
                  </div>
                )}
                {tender.submission.payment_terms && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Payment Terms</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{tender.submission.payment_terms}</span>
                  </div>
                )}
                {tender.submission.delivery_time && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Delivery / Lead Time</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{tender.submission.delivery_time}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Read-Only Submitted Breakdown (always shown) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {tender.boq_type === "COMMERCIAL" ? "Recurring Gas Supply Rate (Primary BOQ Item)" : "Submitted Quotation Breakdown"}
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">Code</th>
                    <th className="px-4 py-3 min-w-[200px]">Item Description</th>
                    <th className="px-4 py-3 min-w-[140px]">Quoted Make / Model</th>
                    <th className="px-4 py-3 w-20 text-center">Qty</th>
                    <th className="px-4 py-3 w-20 text-center">UOM</th>
                    <th className="px-4 py-3 w-32 text-right">Unit Rate (₹)</th>
                    <th className="px-4 py-3 w-32 text-right">Total (₹)</th>
                    <th className="px-4 py-3 w-28 text-center">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tender.items.map((it) => {
                    const subItem = tender.submission?.items.find((si) => si.boq_item_id === it.id);
                    return (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-center font-mono text-slate-500">
                          {it.item_code || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {it.item_name}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {subItem?.make_model_quoted || "-"}
                        </td>
                        <td className="px-4 py-3 text-center">{it.quantity}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{it.uom}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          ₹{(subItem?.quoted_unit_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          ₹{(subItem?.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            subItem?.technical_compliance === "COMPLIANT"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {subItem?.technical_compliance || "COMPLIANT"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Totals */}
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td colSpan={6} className="px-4 py-3 text-right text-slate-600 uppercase">
                      Sub Total (INR):
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">
                      ₹{tender.submission.sub_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={6} className="px-4 py-2.5 text-right text-slate-600 uppercase">
                      GST (18%):
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                      ₹{tender.submission.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td colSpan={6} className="px-4 py-3.5 text-right uppercase text-amber-400">
                      Grand Total Quoted:
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono">
                      ₹{tender.submission.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      ) : tender.is_deadline_passed ? (
        /* CASE 2: DEADLINE PASSED & NOT SUBMITTED */
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center shadow-xs">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            🔒
          </div>
          <h3 className="text-lg font-bold text-slate-900">Tender Submission Window Closed</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            The deadline for submitting quotations for this tender has passed. Submissions are strictly locked. Please contact JECRC Procurement for queries.
          </p>
        </div>
      ) : (
        /* CASE 3: OPEN FOR SUBMISSION */
        <div className="space-y-6">
          {/* Revision Mode Banner */}
          {isEditingRevised && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-base shrink-0">
                  ✏️
                </div>
                <div>
                  <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                    Quotation Revision Mode Active
                  </h3>
                  <p className="text-xs text-amber-900/90 mt-0.5 max-w-2xl">
                    You are updating your rates before the tender deadline. Your previously submitted quotation remains on file until you submit this new revision.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingRevised(false)}
                className="px-4 py-2 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl font-bold text-xs transition-colors whitespace-nowrap self-start md:self-auto"
              >
                ✕ Cancel Revision & View Sealed Quote
              </button>
            </div>
          )}

          {/* Saved Draft Banner */}
          {tender.submission?.status === "DRAFT" && !isEditingRevised && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
              <span className="text-xl">📝</span>
              <div className="text-xs text-blue-900">
                <span className="font-bold">Draft in Progress:</span> You have saved work on this tender. You can adjust your numbers at any time and click <strong className="text-blue-950">&quot;Submit &amp; Lock Quotation&quot;</strong> before the deadline closes.
              </div>
            </div>
          )}

          {/* Submission Mode Tabs */}
          <div className="flex border-b border-slate-200 bg-white p-2 rounded-2xl shadow-xs gap-2">
            <button
              onClick={() => setActiveTab("FORM")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                activeTab === "FORM"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>✍️</span>
              <span>Fill Online Web Form</span>
            </button>

            <button
              onClick={() => setActiveTab("EXCEL")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                activeTab === "EXCEL"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>📊</span>
              <span>Upload Filled Excel Sheet</span>
            </button>

            <button
              onClick={() => setActiveTab("PDF")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                activeTab === "PDF"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>📄</span>
              <span>Upload Signed PDF Quote (AI Auto-Parse)</span>
            </button>
          </div>

          {/* TAB 1: INTERACTIVE WEB FORM */}
          {activeTab === "FORM" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                {/* Table Top Toolbar with Bulk Actions */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Line Item Pricing &amp; Technical Compliance
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Enter your quoted unit rate and model specifications for each line item.
                    </span>
                  </div>

                  {/* Bulk Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-1 bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-xs shadow-xs">
                      <span className="text-slate-500 font-semibold text-[11px]">⚡ Set All GST:</span>
                      {[0, 5, 12, 18, 28].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleApplyGstToAll(pct)}
                          className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition-colors"
                          title={`Set GST to ${pct}% for all items`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleMarkAllCompliant}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1 shadow-xs"
                    >
                      <span>✅</span>
                      <span>Mark All Compliant</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-20">
                      <tr>
                        <th className="px-3 py-3 w-14 text-center sticky left-0 z-30 bg-slate-100">Code</th>
                        <th className="px-3 py-3 min-w-[220px] sticky left-14 z-30 bg-slate-100 border-r border-slate-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                          Item Description &amp; Specs
                        </th>
                        <th className="px-3 py-3 w-16 text-center">Qty</th>
                        <th className="px-3 py-3 w-16 text-center">UOM</th>
                        <th className="px-3 py-3 min-w-[160px]">Quoted Make &amp; Model</th>
                        <th className="px-3 py-3 w-32 text-right">Unit Rate (₹)</th>
                        <th className="px-3 py-3 w-20 text-center">GST %</th>
                        <th className="px-3 py-3 w-32 text-right">Total (₹)</th>
                        <th className="px-3 py-3 w-32 text-center">Compliance</th>
                        <th className="px-3 py-3 min-w-[140px]">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tender.items.map((it) => {
                        const formVal = formItems[it.id] || {
                          boq_item_id: it.id,
                          quoted_unit_price: 0,
                          make_model_quoted: "",
                          technical_compliance: "COMPLIANT",
                          vendor_remarks: "",
                          gst_percent: 18,
                        };
                        const gstPct = Number(formVal.gst_percent ?? 18);
                        const total = (Number(formVal.quoted_unit_price) || 0) * it.quantity;
                        const itemGst = total * (gstPct / 100);

                        return (
                          <tr key={it.id} className="hover:bg-slate-50/60 group">
                            {/* Sticky Column 1: Code */}
                            <td className="px-3 py-3 text-center font-mono text-slate-500 font-semibold sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                              {it.item_code || "-"}
                            </td>

                            {/* Sticky Column 2: Name & Specs */}
                            <td className="px-3 py-3 sticky left-14 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                              <div className="font-bold text-slate-900">{it.item_name}</div>
                              {it.specifications && (
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={it.specifications}>
                                  {it.specifications}
                                </p>
                              )}
                              {Object.keys(it.attributes || {}).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {Object.entries(it.attributes).map(([k, v]) => (
                                    <span key={k} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Qty & UOM */}
                            <td className="px-3 py-3 text-center font-bold">{it.quantity}</td>
                            <td className="px-3 py-3 text-center text-slate-500">{it.uom}</td>

                            {/* Quoted Make & Model */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="e.g. Siemens / Philips"
                                value={formVal.make_model_quoted}
                                onChange={(e) => handleFormItemChange(it.id, "make_model_quoted", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                              />
                            </td>

                            {/* Unit Rate */}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="0.00"
                                value={formVal.quoted_unit_price || ""}
                                onChange={(e) => handleFormItemChange(it.id, "quoted_unit_price", e.target.value)}
                                className="w-full text-right px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                              />
                            </td>

                            {/* GST % */}
                            <td className="px-2 py-2">
                              <select
                                value={formVal.gst_percent ?? 18}
                                onChange={(e) => handleFormItemChange(it.id, "gst_percent", Number(e.target.value))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-center"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>

                            {/* Line Total */}
                            <td className="px-3 py-3 text-right">
                              <div className="font-mono font-bold text-slate-900">₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">+ ₹{itemGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })} GST</div>
                            </td>

                            {/* Compliance */}
                            <td className="px-2 py-2">
                              <select
                                value={formVal.technical_compliance}
                                onChange={(e) => handleFormItemChange(it.id, "technical_compliance", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold"
                              >
                                <option value="COMPLIANT">COMPLIANT</option>
                                <option value="DEVIATION">DEVIATION</option>
                                <option value="NON_COMPLIANT">NON-COMPLIANT</option>
                              </select>
                            </td>

                            {/* Remarks */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="Notes..."
                                value={formVal.vendor_remarks}
                                onChange={(e) => handleFormItemChange(it.id, "vendor_remarks", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Calculation Summary Bar */}
                <div className="bg-slate-900 text-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium">Estimated Commercial Summary</span>
                    <div className="flex items-center space-x-6 text-xs">
                      <div>
                        <span className="text-slate-400">Sub Total: </span>
                        <span className="font-mono font-bold">₹{subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Total GST: </span>
                        <span className="font-mono font-bold">₹{gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-right mr-2">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">Grand Total</span>
                      <span className="text-2xl font-black text-white font-mono">
                        ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Action 1: Save as Draft */}
                    <button
                      type="button"
                      disabled={savingDraft || submitting}
                      onClick={handleSaveDraft}
                      className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center space-x-1.5 disabled:opacity-50"
                      title="Save your quotation progress without submitting"
                    >
                      <span>{savingDraft ? "⏳" : "💾"}</span>
                      <span>{savingDraft ? "Saving Draft..." : "Save Draft"}</span>
                    </button>

                    {/* Action 2: Submit & Lock */}
                    <button
                      type="button"
                      disabled={savingDraft || submitting}
                      onClick={() => setShowConfirmModal(true)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center space-x-2 disabled:opacity-50"
                    >
                      <span>🔒</span>
                      <span>{isEditingRevised ? "Submit Revised Quotation" : "Submit & Lock Quotation"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Commercial Terms Section */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Delivery Period
                  </label>
                  <input
                    type="text"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Warranty Terms
                  </label>
                  <input
                    type="text"
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXCEL UPLOAD */}
          {activeTab === "EXCEL" && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center shadow-xs">
              {/* Hidden file input for Preview/Extract */}
              <input
                type="file"
                ref={previewFileInputRef}
                accept=".xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleParseFileIntoForm(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {/* Hidden file input for Direct Submit */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUploadSubmit(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                📊
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Upload Completed Excel Bidding Template</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto mb-6">
                Upload your completed Excel sheet. You can either extract rates into the interactive web form to review line-by-line first, or submit and seal directly.
              </p>

              {uploading || parsingFile ? (
                <div className="flex flex-col items-center space-y-2 py-4">
                  <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-emerald-700">
                    {parsingFile ? "Extracting rates into interactive form..." : "Reading Excel quotes & sealing bid..."}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => previewFileInputRef.current?.click()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>⚡</span>
                    <span>Extract &amp; Review in Form (Recommended)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>🔒</span>
                    <span>Direct Submit &amp; Seal</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PDF QUOTATION UPLOAD (AI EXTRACTION) */}
          {activeTab === "PDF" && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 p-12 text-center shadow-xs">
              {/* Hidden file input for Preview/Extract */}
              <input
                type="file"
                ref={previewFileInputRef}
                accept=".pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleParseFileIntoForm(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {/* Hidden file input for Direct Submit */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUploadSubmit(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                🤖
              </div>
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-[10px] font-black rounded-full mb-2 uppercase tracking-wide">
                Multi-Page Chunked Extraction
              </span>
              <h3 className="text-base font-bold text-slate-900 mb-1">Upload Signed PDF Quotation (AI Chunked Parsing)</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto mb-6">
                Upload your formal signed quotation PDF. You can preview all AI-extracted rates and terms in the web form first, or submit and seal directly.
              </p>

              {uploading || parsingFile ? (
                <div className="flex flex-col items-center space-y-2 py-4">
                  <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-blue-700">
                    {parsingFile ? "Gemini AI is parsing PDF chunks into web form..." : "Gemini AI is parsing PDF quotation in chunks & sealing bid..."}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => previewFileInputRef.current?.click()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>⚡</span>
                    <span>AI Extract &amp; Review in Form (Recommended)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>🔒</span>
                    <span>Direct Submit &amp; Seal</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3 text-2xl">
              🔒
            </div>
            <h3 className="text-lg font-bold text-slate-900">Confirm Bid Submission</h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you are ready to submit your commercial quotation of:
            </p>
            <div className="my-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-xl text-slate-900">
              ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 mb-4">
              <strong>Notice:</strong> Your quotation will be officially recorded and sealed for tender evaluation. You can revise your rates anytime until the tender submission deadline closes.
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Go Back &amp; Review
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitForm}
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-md"
              >
                {submitting ? "Submitting..." : isEditingRevised ? "Submit Revision" : "Confirm & Submit Bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
