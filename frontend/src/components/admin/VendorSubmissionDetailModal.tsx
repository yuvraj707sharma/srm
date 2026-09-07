"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api/client";

interface DiscrepancyDetail {
  title: string;
  type: string;
  risk_level: string;
  explanation: string;
  action_recommended: string;
  detected_specs?: string;
}

interface SubmissionItemDetail {
  submission_item_id: string;
  boq_item_id: string | null;
  item_code: string;
  item_name: string;
  specifications: string;
  quantity: number;
  uom: string;
  quoted_unit_price: number;
  negotiated_unit_price: number | null;
  total_amount: number;
  negotiated_total_amount: number | null;
  make_model_quoted: string | null;
  technical_compliance: "COMPLIANT" | "DEVIATION" | "NON_COMPLIANT";
  vendor_remarks: string | null;
  discrepancy: DiscrepancyDetail | null;
}

interface SubmissionDetailData {
  submission_id: string;
  boq_id: string;
  tender_number: string;
  tender_title: string;
  status: string;
  submission_type: string;
  submitted_at: string | null;
  vendor: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    pan: string | null;
    gstin: string | null;
    primary_email: string | null;
    primary_phone: string | null;
    address: string;
  };
  commercials: {
    sub_total: number;
    gst_percent: number;
    gst_amount: number;
    grand_total: number;
    negotiated_grand_total: number | null;
    payment_terms: string;
    delivery_time: string;
    warranty_terms: string;
  };
  audit: {
    technical_score: number | null;
    technical_notes: string | null;
    compliant_count: number;
    deviation_count: number;
    non_compliant_count: number;
    total_items: number;
  };
  items: SubmissionItemDetail[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boqId: string;
  submissionId: string | null;
  vendorName?: string;
}

export default function VendorSubmissionDetailModal({
  isOpen,
  onClose,
  boqId,
  submissionId,
  vendorName,
}: Props) {
  const [data, setData] = useState<SubmissionDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"items" | "specs" | "terms">("items");

  useEffect(() => {
    if (isOpen && submissionId) {
      loadSubmission();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, submissionId]);

  async function loadSubmission() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/submissions/${submissionId}`);
      if (!res.ok) {
        throw new Error("Failed to load vendor submission details.");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load submission.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header Banner */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Vendor Bid Details
              </span>
              {data?.status && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {data.status}
                </span>
              )}
              {data?.submission_type && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 text-slate-300">
                  {data.submission_type.replace("_", " ")}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              {data?.vendor?.legal_name || vendorName || "Vendor Quotation"}
              {data?.vendor?.trade_name && (
                <span className="text-xs font-normal text-slate-300">({data.vendor.trade_name})</span>
              )}
            </h2>
            <p className="text-xs text-slate-300">
              Tender: <span className="font-semibold text-white">{data?.tender_title || boqId}</span>
              {data?.tender_number && <span className="ml-2 font-mono text-indigo-300">[{data.tender_number}]</span>}
              {data?.submitted_at && (
                <span className="ml-3 text-slate-400">
                  • Submitted: {new Date(data.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700/50 transition-colors"
            title="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-600">Retrieving full quotation & AI spec compliance audit...</p>
          </div>
        ) : error || !data ? (
          <div className="p-12 text-center text-red-600">
            <p className="font-bold">{error || "Failed to load submission data."}</p>
            <button
              onClick={loadSubmission}
              className="mt-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg"
            >
              Retry Loading
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {/* Top Cards: Technical Audit & Commercial Profile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Technical Audit Score Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">AI Technical Spec Audit</span>
                  <div
                    className={`px-2.5 py-1 rounded-full text-xs font-black ${
                      (data.audit.technical_score || 0) >= 80
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : (data.audit.technical_score || 0) >= 50
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-red-100 text-red-800 border border-red-200"
                    }`}
                  >
                    Score: {data.audit.technical_score !== null ? `${data.audit.technical_score}%` : "Pending"}
                  </div>
                </div>

                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-100 p-2.5 rounded-xl text-center">
                    <span className="block text-lg font-bold">{data.audit.compliant_count}</span>
                    <span className="text-[10px] font-semibold uppercase">Compliant</span>
                  </div>
                  <div className="flex-1 bg-amber-50 text-amber-700 border border-amber-100 p-2.5 rounded-xl text-center">
                    <span className="block text-lg font-bold">{data.audit.deviation_count}</span>
                    <span className="text-[10px] font-semibold uppercase">Deviations</span>
                  </div>
                  <div className="flex-1 bg-red-50 text-red-700 border border-red-100 p-2.5 rounded-xl text-center">
                    <span className="block text-lg font-bold">{data.audit.non_compliant_count}</span>
                    <span className="text-[10px] font-semibold uppercase">Non-Compliant</span>
                  </div>
                </div>

                {data.audit.technical_notes && (
                  <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150 line-clamp-3">
                    <span className="font-semibold text-slate-800">Auditor Notes: </span>
                    {data.audit.technical_notes}
                  </p>
                )}
              </div>

              {/* Commercial Bid Summary */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Commercial Bid Value</span>
                <div className="space-y-1.5 my-auto">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Base Sub-Total:</span>
                    <span className="font-mono font-semibold text-slate-900">₹{data.commercials.sub_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>GST ({data.commercials.gst_percent}%):</span>
                    <span className="font-mono font-semibold text-slate-900">₹{data.commercials.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-150 flex justify-between items-baseline">
                    <span className="text-xs font-bold text-slate-800">Quoted Grand Total:</span>
                    <span className="font-mono text-base font-extrabold text-blue-700">₹{data.commercials.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {data.commercials.negotiated_grand_total && (
                    <div className="pt-1 flex justify-between items-baseline text-xs text-emerald-700 font-semibold">
                      <span>Negotiated Total:</span>
                      <span className="font-mono font-bold">₹{data.commercials.negotiated_grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Warranty: <strong className="text-slate-700">{data.commercials.warranty_terms}</strong></span>
                  <span>Delivery: <strong className="text-slate-700">{data.commercials.delivery_time}</strong></span>
                </div>
              </div>

              {/* Vendor Official Credentials */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between text-xs text-slate-600">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Vendor Verification Info</span>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Contact Info</span>
                    <p className="font-medium text-slate-800">{data.vendor.primary_email || "N/A"}</p>
                    <p className="text-slate-600">{data.vendor.primary_phone || "N/A"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">GSTIN</span>
                      <p className="font-mono font-semibold text-slate-800">{data.vendor.gstin || "N/A"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">PAN</span>
                      <p className="font-mono font-semibold text-slate-800">{data.vendor.pan || "N/A"}</p>
                    </div>
                  </div>
                  {data.vendor.address && (
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 truncate">
                      📍 {data.vendor.address}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
              <button
                onClick={() => setActiveTab("items")}
                className={`pb-3 transition-colors ${
                  activeTab === "items"
                    ? "text-indigo-600 border-b-2 border-indigo-600 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Line Items & Quoted Pricing ({data.items.length})
              </button>
              <button
                onClick={() => setActiveTab("specs")}
                className={`pb-3 transition-colors ${
                  activeTab === "specs"
                    ? "text-indigo-600 border-b-2 border-indigo-600 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Technical Spec Audit & Discrepancies
              </button>
              <button
                onClick={() => setActiveTab("terms")}
                className={`pb-3 transition-colors ${
                  activeTab === "terms"
                    ? "text-indigo-600 border-b-2 border-indigo-600 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Commercial Terms & Conditions
              </button>
            </div>

            {/* Tab 1: Line Items & Quoted Pricing */}
            {activeTab === "items" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white font-semibold">
                      <tr>
                        <th className="py-3.5 px-4 w-12 text-center">#</th>
                        <th className="py-3.5 px-4">Tender Item & Required Specs</th>
                        <th className="py-3.5 px-4">Vendor Quoted Make / Model</th>
                        <th className="py-3.5 px-3 text-center">Qty</th>
                        <th className="py-3.5 px-4 text-right">Quoted Unit Price (₹)</th>
                        <th className="py-3.5 px-4 text-right">Total Amount (₹)</th>
                        <th className="py-3.5 px-4 text-center">Tech Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.items.map((it, idx) => {
                        const isNonCompliant = it.technical_compliance === "NON_COMPLIANT";
                        const isDeviation = it.technical_compliance === "DEVIATION";
                        return (
                          <tr key={it.submission_item_id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3.5 px-4 max-w-xs">
                              <div className="font-bold text-slate-900">{it.item_name}</div>
                              {it.specifications && (
                                <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{it.specifications}</div>
                              )}
                              {it.item_code && (
                                <span className="inline-block mt-1 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                  Code: {it.item_code}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                {it.make_model_quoted || "Not Specified"}
                              </div>
                              {it.vendor_remarks && (
                                <div className="text-[11px] text-slate-500 italic mt-0.5">Note: {it.vendor_remarks}</div>
                              )}
                              {it.discrepancy && it.discrepancy.risk_level !== "NONE" && (
                                <div className="mt-1">
                                  <span
                                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      it.discrepancy.risk_level === "HIGH"
                                        ? "bg-red-100 text-red-700 border border-red-200"
                                        : "bg-amber-100 text-amber-700 border border-amber-200"
                                    }`}
                                  >
                                    ⚠️ {it.discrepancy.title}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-center font-medium text-slate-700">
                              {it.quantity} {it.uom}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-800">
                              ₹{it.quoted_unit_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                              ₹{it.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              {it.negotiated_total_amount && (
                                <div className="text-[11px] text-emerald-600 font-semibold">
                                  Neg: ₹{it.negotiated_total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                                  isNonCompliant
                                    ? "bg-red-100 text-red-700 border border-red-300"
                                    : isDeviation
                                    ? "bg-amber-100 text-amber-700 border border-amber-300"
                                    : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                }`}
                              >
                                {it.technical_compliance}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Technical Spec Audit & Discrepancies */}
            {activeTab === "specs" && (
              <div className="space-y-4">
                {data.items.map((it, idx) => {
                  const isNonCompliant = it.technical_compliance === "NON_COMPLIANT";
                  const isDeviation = it.technical_compliance === "DEVIATION";
                  const disc = it.discrepancy;

                  return (
                    <div
                      key={it.submission_item_id || idx}
                      className={`p-5 rounded-2xl border transition-all ${
                        isNonCompliant
                          ? "bg-red-50/40 border-red-200 shadow-sm"
                          : isDeviation
                          ? "bg-amber-50/40 border-amber-200 shadow-sm"
                          : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pb-3 border-b border-slate-150">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-slate-500">Item #{idx + 1}</span>
                            <span className="text-slate-300">•</span>
                            <h3 className="text-sm font-bold text-slate-900">{it.item_name}</h3>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Required: <strong className="text-slate-700">{it.specifications || "Standard Specifications"}</strong>
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                              isNonCompliant
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : isDeviation
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            }`}
                          >
                            {it.technical_compliance}
                          </span>
                          {disc?.risk_level && disc.risk_level !== "NONE" && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-white">
                              {disc.risk_level} RISK
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Quoted Information */}
                        <div className="bg-white/80 p-3.5 rounded-xl border border-slate-150">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            Vendor Quoted Details
                          </span>
                          <p className="text-sm font-bold text-indigo-950">{it.make_model_quoted || "Not specified"}</p>
                          {disc?.detected_specs && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-semibold text-slate-700">Detected Attributes: </span>
                              {disc.detected_specs}
                            </p>
                          )}
                          {it.vendor_remarks && (
                            <p className="text-xs text-slate-500 mt-1 italic">
                              Remarks: {it.vendor_remarks}
                            </p>
                          )}
                        </div>

                        {/* AI Discrepancy Evaluation */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isNonCompliant
                              ? "bg-red-100/50 border-red-200 text-red-950"
                              : isDeviation
                              ? "bg-amber-100/50 border-amber-200 text-amber-950"
                              : "bg-emerald-50/50 border-emerald-200 text-emerald-950"
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider block mb-1">
                            {disc?.title || (isNonCompliant ? "Critical Spec Discrepancy" : "Compliance Assessment")}
                          </span>
                          <p className="text-xs leading-relaxed">
                            {disc?.explanation ||
                              (isNonCompliant
                                ? "Quoted equipment fails core tender performance standards."
                                : "Quoted make and model meets or exceeds all technical tender requirements.")}
                          </p>
                          {disc?.action_recommended && (
                            <div className="mt-2 pt-2 border-t border-black/10 text-xs font-medium">
                              <span className="font-bold">Recommended Action: </span>
                              {disc.action_recommended}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 3: Commercial Terms & Conditions */}
            {activeTab === "terms" && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Bid Commercial Stipulations</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Payment Terms</span>
                    <p className="mt-1 font-semibold text-slate-800">{data.commercials.payment_terms}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Delivery Schedule</span>
                    <p className="mt-1 font-semibold text-slate-800">{data.commercials.delivery_time}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Warranty & AMC Terms</span>
                    <p className="mt-1 font-semibold text-slate-800">{data.commercials.warranty_terms}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                  <span>Vendor Submission ID: <code className="font-mono text-slate-700">{data.submission_id}</code></span>
                  <span>BOQ ID: <code className="font-mono text-slate-700">{data.boq_id}</code></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            JECRC University & Medical College Procurement Evaluation Portal
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
