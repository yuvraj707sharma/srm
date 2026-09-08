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
}

export default function VendorTenderBiddingPage() {
  const params = useParams();
  const router = useRouter();
  const boqId = params.id as string;

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submission Mode: "FORM" | "EXCEL" | "PDF"
  const [activeTab, setActiveTab] = useState<"FORM" | "EXCEL" | "PDF">("FORM");

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

      // Initialize form inputs if not submitted
      if (!data.submission) {
        const initialForm: Record<string, BidFormItem> = {};
        data.items.forEach((it) => {
          initialForm[it.id] = {
            boq_item_id: it.id,
            quoted_unit_price: 0,
            make_model_quoted: "",
            technical_compliance: "COMPLIANT",
            vendor_remarks: "",
          };
        });
        setFormItems(initialForm);
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
    tender.items.forEach((it) => {
      const q = formItems[it.id];
      const rate = q ? Number(q.quoted_unit_price) || 0 : 0;
      sub += rate * it.quantity;
    });
    const gst = sub * 0.18;
    return { subTotal: sub, gstAmount: gst, grandTotal: sub + gst };
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

  // Submit via Web Form
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
      }));

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          items: itemsPayload,
          gst_percent: 18.0,
          payment_terms: paymentTerms,
          delivery_time: deliveryTime,
          warranty_terms: warrantyTerms,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Submission failed.");
      }

      setShowConfirmModal(false);
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to submit bid.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit via File Upload (Excel or PDF)
  const handleFileUploadSubmit = async (selectedFile: File) => {
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

      {/* CASE 1: BID ALREADY SUBMITTED & LOCKED */}
      {isSubmitted && tender.submission ? (
        <div className="space-y-6">
          {/* Lock Banner */}
          <div className="bg-emerald-50 border-2 border-emerald-300/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-7 h-7 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
                  🔒
                </span>
                <h3 className="text-base font-black text-emerald-950">
                  Bid Submitted & Permanently Locked
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
                . In compliance with JECRC Foundation Procurement Security Rules, your submitted quotes are sealed and cannot be modified.
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
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Quoted Value
              </span>
              <span className="text-2xl font-black text-emerald-950 font-mono">
                ₹{tender.submission.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">
                Includes 18% GST (₹{tender.submission.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
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
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Line Item Pricing & Technical Compliance
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Enter your quoted unit rate and model specifications for each line item.
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 w-14 text-center">Code</th>
                        <th className="px-3 py-3 min-w-[200px]">Item Description & Specs</th>
                        <th className="px-3 py-3 w-16 text-center">Qty</th>
                        <th className="px-3 py-3 w-16 text-center">UOM</th>
                        <th className="px-3 py-3 min-w-[160px]">Quoted Make & Model</th>
                        <th className="px-3 py-3 w-32 text-right">Unit Rate (₹)</th>
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
                        };
                        const total = (Number(formVal.quoted_unit_price) || 0) * it.quantity;

                        return (
                          <tr key={it.id} className="hover:bg-slate-50/60">
                            {/* Code */}
                            <td className="px-3 py-3 text-center font-mono text-slate-500 font-semibold">
                              {it.item_code || "-"}
                            </td>

                            {/* Name & Specs */}
                            <td className="px-3 py-3">
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

                            {/* Line Total */}
                            <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                              ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
                        <span className="text-slate-400">GST (18%): </span>
                        <span className="font-mono font-bold">₹{gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">Grand Total</span>
                      <span className="text-2xl font-black text-white font-mono">
                        ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center space-x-2"
                    >
                      <span>🔒 Submit & Lock Quotation</span>
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXCEL UPLOAD */}
          {activeTab === "EXCEL" && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center shadow-xs">
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
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Upload the completed Excel sheet. Our backend will automatically map your quoted rates and models to the BOQ line items and lock your submission.
              </p>

              {uploading ? (
                <div className="flex flex-col items-center space-y-2 py-4">
                  <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-emerald-700">Reading Excel quotes & locking bid...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  Select Filled Excel File (.xlsx)
                </button>
              )}
            </div>
          )}

          {/* TAB 3: PDF QUOTATION UPLOAD (AI EXTRACTION) */}
          {activeTab === "PDF" && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 p-12 text-center shadow-xs">
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
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Upload your formal signed quotation PDF. Gemini AI processes multi-page and long quotations in intelligent chunks — extracting all recurring rates, one-time charges, model numbers, and commercial clauses with 100% data fidelity.
              </p>

              {uploading ? (
                <div className="flex flex-col items-center space-y-2 py-4">
                  <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-blue-700">Gemini AI is parsing PDF quotation in chunks & sealing bid...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  Select Signed Quotation (.pdf)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-3 text-2xl">
              🔒
            </div>
            <h3 className="text-lg font-bold text-slate-900">Confirm Bid Submission</h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you are ready to submit your commercial quotation of:
            </p>
            <div className="my-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-xl text-slate-900">
              ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 mb-4">
              <strong>CRITICAL NOTICE:</strong> Under strict procurement protocol, once you confirm submission, your bid will be permanently locked. You will not be able to edit or withdraw your quotes.
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Go Back & Review
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitForm}
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-md"
              >
                {submitting ? "Submitting & Locking..." : "Confirm & Lock Bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
