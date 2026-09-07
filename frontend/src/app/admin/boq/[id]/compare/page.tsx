"use client";

import { useEffect, useState, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../../lib/api/client";
import VendorSubmissionDetailModal from "../../../../../components/admin/VendorSubmissionDetailModal";

interface DiscrepancyInfo {
  title: string;
  type: string;
  risk_level: string;
  explanation: string;
  action_recommended: string;
  detected_specs?: string;
}

interface ItemQuote {
  submission_item_id?: string;
  model_no: string;
  initial_quoted_price: number;
  negotiated_price?: number;
  total_amount: number;
  negotiated_total_amount?: number;
  technical_compliance: string;
  vendor_remarks?: string;
  discrepancy?: DiscrepancyInfo;
}

interface VendorMeta {
  submission_id: string;
  vendor_id: string;
  vendor_name: string;
  company_name: string;
  contact_no: string;
  primary_email: string;
  payment_terms: string;
  delivery_time: string;
  warranty_terms?: string;
  sub_total: number;
  gst_percent: number;
  gst_amount: number;
  grand_total: number;
  negotiated_grand_total?: number;
  effective_total: number;
  l_rank: string;
  is_t1: boolean;
  compliance_percentage: number;
  technical_score?: number;
  technical_notes?: string;
  compliant_count?: number;
  deviation_count?: number;
  non_compliant_count?: number;
  total_items?: number;
}

interface MatrixRow {
  s_no: number;
  boq_item_id: string;
  item_code: string;
  item_name: string;
  specifications: string;
  quantity: number;
  uom: string;
  attributes: Record<string, string>;
  lowest_price: number;
  lowest_submission_id?: string;
  vendor_quotes: Record<string, ItemQuote>;
}

interface CostAnalytics {
  lowest_grand_total: number;
  highest_grand_total: number;
  price_spread: number;
  potential_savings: number;
  item_stats: Record<
    string,
    {
      min_price: number;
      max_price: number;
      avg_price: number;
      spread: number;
      variance_pct: number;
    }
  >;
}

interface QCBSRanking {
  submission_id: string;
  vendor_name: string;
  l_rank: string;
  effective_total: number;
  commercial_score: number;
  technical_score: number;
  technical_weighted: number;
  qcbs_composite_score: number;
}

interface Advisory {
  status: string;
  headline: string;
  summary: string;
  badge: string;
  recommended_vendor_id: string | null;
  action_items: string[];
}

interface ComparativeData {
  boq_id: string;
  tender_number: string;
  title: string;
  department?: string;
  status: string;
  deadline_at?: string;
  is_locked: boolean;
  custom_columns: string[];
  vendors: VendorMeta[];
  rows: MatrixRow[];
  cost_analytics?: CostAnalytics;
  l1_profile?: VendorMeta;
  t1_profile?: VendorMeta;
  qcbs_rankings?: QCBSRanking[];
  advisory?: Advisory;
}

export default function ComparativeStatementPage() {
  const params = useParams();
  const router = useRouter();
  const boqId = params.id as string;

  const [data, setData] = useState<ComparativeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab: "matrix" | "advisory" | "discrepancies" | "cost"
  const [activeTab, setActiveTab] = useState<"advisory" | "matrix" | "discrepancies" | "cost">("advisory");

  // Modal State for Vendor BOQ Detail View
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string | undefined>(undefined);

  // Action loading states
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  // Negotiated Rates State: { [submission_id]: { [submission_item_id]: price } }
  const [negotiatedRates, setNegotiatedRates] = useState<Record<string, Record<string, number>>>({});
  const [savingNegotiation, setSavingNegotiation] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadComparativeData();
  }, [boqId]);

  async function loadComparativeData() {
    try {
      setLoading(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/comparative-statement`);
      if (!res.ok) {
        throw new Error("Failed to load comparative statement data.");
      }
      const compData = await res.json();
      setData(compData);

      // Initialize negotiation edits
      const initialRates: Record<string, Record<string, number>> = {};
      compData.vendors.forEach((v: VendorMeta) => {
        initialRates[v.submission_id] = {};
        compData.rows.forEach((r: MatrixRow) => {
          const q = r.vendor_quotes[v.submission_id];
          if (q && q.submission_item_id) {
            initialRates[v.submission_id][q.submission_item_id] =
              q.negotiated_price !== undefined && q.negotiated_price !== null
                ? q.negotiated_price
                : q.initial_quoted_price;
          }
        });
      });
      setNegotiatedRates(initialRates);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const handleNegotiatedPriceChange = (submissionId: string, itemId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setNegotiatedRates((prev) => ({
      ...prev,
      [submissionId]: {
        ...(prev[submissionId] || {}),
        [itemId]: num,
      },
    }));
  };

  const handleSaveNegotiations = async (submissionId: string) => {
    setSavingNegotiation(true);
    setSaveSuccess(false);
    try {
      const vendorRates = negotiatedRates[submissionId] || {};
      const itemsPayload = Object.entries(vendorRates).map(([subItemId, negPrice]) => ({
        submission_item_id: subItemId,
        negotiated_unit_price: negPrice,
      }));

      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/negotiate`, {
        method: "PATCH",
        body: JSON.stringify({
          submission_id: submissionId,
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadComparativeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNegotiation(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setIsDownloadingExcel(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/export-excel`);
      if (!res.ok) {
        throw new Error("Failed to generate comparative spreadsheet.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Comparative_Statement_${data?.tender_number || "BOQ"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error exporting Excel: " + (err.message || "Failed to download"));
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handleRunAiAudit = async () => {
    try {
      setIsAuditing(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/run-ai-audit`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to execute AI technical specification audit.");
      }
      await loadComparativeData();
    } catch (err: any) {
      alert("AI Audit error: " + (err.message || "Error running audit"));
    } finally {
      setIsAuditing(false);
    }
  };

  const openVendorDetail = (submissionId: string, vendorName: string) => {
    setSelectedSubmissionId(submissionId);
    setSelectedVendorName(vendorName);
  };

  if (loading) {
    return (
      <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-semibold text-slate-600">
          Generating Comprehensive Comparative Statement, QCBS Scores & Spec Discrepancy Audit...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-12 text-center text-red-600 max-w-lg mx-auto">
        <h3 className="text-lg font-bold">Error Loading Statement</h3>
        <p className="text-xs mt-1 text-slate-500">{error || "No data returned."}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  const l1Vendor = data.l1_profile || data.vendors.find((v) => v.l_rank === "L1");
  const t1Vendor = data.t1_profile || data.vendors.find((v) => v.is_t1);
  const advisory = data.advisory;
  const isL1AtRisk = advisory?.status === "CRITICAL_L1_DISCREPANCY_ALERT";

  return (
    <div className="max-w-[102rem] mx-auto space-y-6 text-slate-900 pb-24 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 mb-1.5">
            <Link href="/admin/boq" className="text-xs font-semibold text-indigo-600 hover:underline">
              ← Back to BOQs
            </Link>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
              {data.tender_number}
            </span>
            {data.department && (
              <span className="text-xs font-medium text-slate-500">Dept: {data.department}</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Comparative Statement: {data.title}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Commercial L1, Technical T1, QCBS Composite Scoring & Specification Discrepancy Analysis
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunAiAudit}
            disabled={isAuditing}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
            title="Re-verify all quoted makes/models against tender specifications using Gemini AI"
          >
            <span className={isAuditing ? "animate-spin" : ""}>⚡</span>
            <span>{isAuditing ? "Auditing Specifications..." : "Re-run AI Spec Audit"}</span>
          </button>

          <button
            onClick={handleDownloadExcel}
            disabled={isDownloadingExcel}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-sm hover:shadow disabled:opacity-50"
          >
            {isDownloadingExcel ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            <span>{isDownloadingExcel ? "Exporting..." : "Download Excel (.xlsx)"}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center space-x-2 animate-fadeIn">
          <span>✅</span>
          <span>Negotiated rates saved and totals recalculated successfully!</span>
        </div>
      )}

      {/* Critical Discrepancy Alert Banner */}
      {isL1AtRisk && (
        <div className="bg-gradient-to-r from-red-50 via-rose-50 to-amber-50 border-2 border-red-300 rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white">
                Disqualification Risk Warning
              </span>
              <h3 className="text-sm font-bold text-red-950">{advisory?.headline}</h3>
            </div>
            <button
              onClick={() => setActiveTab("discrepancies")}
              className="text-xs font-bold text-red-700 hover:text-red-900 underline"
            >
              Inspect Mismatched Items →
            </button>
          </div>
          <p className="text-xs text-red-900 leading-relaxed font-medium">
            {advisory?.summary}
          </p>
        </div>
      )}

      {/* Navigation View Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 text-xs font-bold px-2">
        <button
          onClick={() => setActiveTab("advisory")}
          className={`px-4 py-3 rounded-t-2xl transition-all flex items-center space-x-2 ${
            activeTab === "advisory"
              ? "bg-white text-indigo-700 border-t-2 border-x border-slate-200 font-extrabold shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>🎯</span>
          <span>Executive Advisory & QCBS</span>
        </button>
        <button
          onClick={() => setActiveTab("matrix")}
          className={`px-4 py-3 rounded-t-2xl transition-all flex items-center space-x-2 ${
            activeTab === "matrix"
              ? "bg-white text-indigo-700 border-t-2 border-x border-slate-200 font-extrabold shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>📊</span>
          <span>Comparative Matrix & Negotiations</span>
        </button>
        <button
          onClick={() => setActiveTab("discrepancies")}
          className={`px-4 py-3 rounded-t-2xl transition-all flex items-center space-x-2 ${
            activeTab === "discrepancies"
              ? "bg-white text-indigo-700 border-t-2 border-x border-slate-200 font-extrabold shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>🔬</span>
          <span>Technical Spec Match & Discrepancies</span>
          {isL1AtRisk && (
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("cost")}
          className={`px-4 py-3 rounded-t-2xl transition-all flex items-center space-x-2 ${
            activeTab === "cost"
              ? "bg-white text-indigo-700 border-t-2 border-x border-slate-200 font-extrabold shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>💰</span>
          <span>Cost-Wise Spread & Variance</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EXECUTIVE ADVISORY & QCBS COMPOSITE SCORING */}
      {/* ========================================================================= */}
      {activeTab === "advisory" && (
        <div className="space-y-6">
          {/* L1 & T1 Profile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* L1 Commercial Leader Card */}
            <div
              className={`p-6 rounded-3xl border-2 transition-all shadow-sm ${
                isL1AtRisk
                  ? "bg-gradient-to-br from-amber-50/90 to-red-50/50 border-amber-300"
                  : "bg-amber-50/70 border-amber-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 bg-amber-500 text-white text-[11px] font-black rounded-lg uppercase tracking-wider">
                      Commercial L1 Winner
                    </span>
                    {isL1AtRisk && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold rounded-md">
                        ⚠️ Spec Alert ({l1Vendor?.non_compliant_count || 0} Non-Compliant)
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mt-2">
                    {l1Vendor ? l1Vendor.vendor_name : "No Valid Bids"}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {l1Vendor?.company_name} • Contact: {l1Vendor?.contact_no}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">Effective Total</span>
                  <span className="text-2xl font-black font-mono text-amber-950">
                    ₹{(l1Vendor?.effective_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Includes 18% GST</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-amber-200/60 flex items-center justify-between">
                <div className="flex items-center space-x-3 text-xs">
                  <span>
                    Technical Compliance: <strong>{l1Vendor?.compliance_percentage}%</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Deviations: <strong className="text-amber-700">{l1Vendor?.deviation_count || 0}</strong>
                  </span>
                </div>

                {l1Vendor && (
                  <button
                    onClick={() => openVendorDetail(l1Vendor.submission_id, l1Vendor.vendor_name)}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                  >
                    View Full Submitted BOQ →
                  </button>
                )}
              </div>
            </div>

            {/* T1 Technical Leader Card */}
            <div className="p-6 rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-blue-50/90 to-indigo-50/50 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[11px] font-black rounded-lg uppercase tracking-wider">
                      Technical T1 Leader
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-md">
                      Highest Compliance ({(t1Vendor?.compliance_percentage || 0)}%)
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mt-2">
                    {t1Vendor ? t1Vendor.vendor_name : "No Valid Bids"}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t1Vendor?.company_name} • Contact: {t1Vendor?.contact_no}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider block">Commercial Total</span>
                  <span className="text-2xl font-black font-mono text-blue-950">
                    ₹{(t1Vendor?.effective_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Includes 18% GST</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-blue-200/60 flex items-center justify-between">
                <div className="flex items-center space-x-3 text-xs">
                  <span>
                    Compliant Items: <strong className="text-emerald-700">{t1Vendor?.compliant_count || 0} / {t1Vendor?.total_items || 0}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Non-Compliant: <strong className="text-red-700">{t1Vendor?.non_compliant_count || 0}</strong>
                  </span>
                </div>

                {t1Vendor && (
                  <button
                    onClick={() => openVendorDetail(t1Vendor.submission_id, t1Vendor.vendor_name)}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                  >
                    View Full Submitted BOQ →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* QCBS Quality & Cost Based Ranking Table */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  QCBS Composite Ranking (70% Commercial + 30% Technical)
                </h3>
                <p className="text-xs text-slate-500">
                  Government & University Procurement Standard: balances lowest cost with technical specification fidelity.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-lg text-slate-700 font-semibold">
                Score Formula: (L1 / Bid * 70) + (Tech Score * 0.30)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Rank</th>
                    <th className="py-3 px-4">Vendor Name</th>
                    <th className="py-3 px-4 text-center">Cost Rank</th>
                    <th className="py-3 px-4 text-right">Effective Bid (₹)</th>
                    <th className="py-3 px-4 text-right">Commercial Score (/70)</th>
                    <th className="py-3 px-4 text-right">Technical Score (/100)</th>
                    <th className="py-3 px-4 text-right">Technical Weighted (/30)</th>
                    <th className="py-3 px-4 text-right font-black text-amber-300">Composite Score (/100)</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.qcbs_rankings?.map((q, idx) => (
                    <tr key={q.submission_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                            idx === 0
                              ? "bg-amber-400 text-slate-950 font-black shadow-xs"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{q.vendor_name}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {q.l_rank}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium">
                        ₹{q.effective_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600">{q.commercial_score.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600">{q.technical_score.toFixed(1)}%</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600">{q.technical_weighted.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-sm font-extrabold text-indigo-700">
                        {q.qcbs_composite_score.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openVendorDetail(q.submission_id, q.vendor_name)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg"
                        >
                          View Bid
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Strategic Action Items for Purchase Committee */}
          {advisory?.action_items && advisory.action_items.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📋</span>
                <span>Procurement & Purchase Committee Action Items</span>
              </h3>
              <ul className="space-y-2 text-xs text-slate-700">
                {advisory.action_items.map((act, i) => (
                  <li key={i} className="flex items-start space-x-2.5 p-3 rounded-xl bg-slate-50 border border-slate-150">
                    <span className="font-bold text-indigo-600 shrink-0">{i + 1}.</span>
                    <span className="leading-relaxed font-medium">{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SIDE-BY-SIDE COMPARATIVE STATEMENT MATRIX */}
      {/* ========================================================================= */}
      {activeTab === "matrix" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[750px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white sticky top-0 z-20">
                {/* Row 1: Base info + Vendor Meta Headers */}
                <tr className="border-b border-slate-800">
                  <th colSpan={4 + data.custom_columns.length} className="px-4 py-3 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider">
                    Required Specifications ({data.rows.length} Items)
                  </th>
                  {data.vendors.map((v, idx) => (
                    <th
                      key={v.submission_id}
                      colSpan={3}
                      className={`px-4 py-3 text-center border-l border-slate-700 ${
                        v.l_rank === "L1" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <span className="text-xs font-black px-2 py-0.5 rounded bg-black/30">
                          {v.l_rank}
                        </span>
                        <span className="font-bold text-xs">Vendor {idx + 1}: {v.vendor_name}</span>
                      </div>
                      <div className="text-[10px] opacity-80 font-normal mt-0.5">
                        {v.company_name} • {v.contact_no}
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openVendorDetail(v.submission_id, v.vendor_name)}
                          className="px-2.5 py-0.5 bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold rounded-md transition-colors"
                        >
                          📄 View Submitted BOQ
                        </button>
                        <span className="text-[10px] font-mono opacity-90">
                          Tech: {v.compliance_percentage}%
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Row 2: Sub-headers */}
                <tr className="bg-slate-800 text-slate-300 text-[11px] font-semibold border-b border-slate-700">
                  <th className="px-3 py-2 w-12 text-center">S.No</th>
                  <th className="px-3 py-2 min-w-[200px]">Item Description</th>
                  <th className="px-3 py-2 w-16 text-center">UOM</th>
                  <th className="px-3 py-2 w-16 text-center">Qty</th>
                  {data.custom_columns.map((col) => (
                    <th key={col} className="px-3 py-2 min-w-[120px] text-slate-400 bg-slate-850">
                      {col}
                    </th>
                  ))}
                  {data.vendors.map((v) => (
                    <Fragment key={v.submission_id}>
                      <th className="px-3 py-2 w-28 text-right border-l border-slate-700">
                        Quoted (₹)
                      </th>
                      <th className="px-3 py-2 w-28 text-right bg-blue-900/40 text-blue-200">
                        Negotiated (₹)
                      </th>
                      <th className="px-3 py-2 w-28 text-right">
                        Total Amount (₹)
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>

              {/* Data Rows */}
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {data.rows.map((row) => (
                  <tr key={row.boq_item_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3 text-center font-mono font-semibold text-slate-500">
                      {row.s_no}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900 text-xs">{row.item_name}</div>
                      {row.specifications && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={row.specifications}>
                          {row.specifications}
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center font-medium text-slate-600">
                      {row.uom}
                    </td>

                    <td className="px-3 py-3 text-center font-bold text-slate-900">
                      {row.quantity}
                    </td>

                    {data.custom_columns.map((col) => (
                      <td key={col} className="px-3 py-3 text-slate-600 bg-slate-50/50">
                        {row.attributes[col] || "-"}
                      </td>
                    ))}

                    {data.vendors.map((v) => {
                      const quote = row.vendor_quotes[v.submission_id] || {
                        initial_quoted_price: 0,
                        total_amount: 0,
                        technical_compliance: "NON_COMPLIANT",
                        model_no: "-",
                      };

                      const currentNeg =
                        quote.submission_item_id && negotiatedRates[v.submission_id]
                          ? negotiatedRates[v.submission_id][quote.submission_item_id]
                          : quote.negotiated_price || quote.initial_quoted_price;

                      const isItemL1 = row.lowest_submission_id === v.submission_id;
                      const hasDeviation = quote.technical_compliance !== "COMPLIANT";

                      return (
                        <Fragment key={v.submission_id}>
                          {/* Quoted Price */}
                          <td className={`px-3 py-3 text-right font-mono border-l border-slate-200 ${
                            isItemL1 ? "bg-amber-50/60 font-bold text-amber-900" : ""
                          }`}>
                            ₹{quote.initial_quoted_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            {quote.model_no && quote.model_no !== "-" && (
                              <div className="text-[10px] text-slate-500 font-sans mt-0.5 flex items-center justify-end gap-1">
                                {hasDeviation && (
                                  <span className="text-red-500 font-bold" title="Specification Mismatch">⚠️</span>
                                )}
                                <span className="truncate max-w-[120px]">{quote.model_no}</span>
                              </div>
                            )}
                          </td>

                          {/* Negotiated Price (Input) */}
                          <td className="px-2 py-2 text-right bg-blue-50/20">
                            {quote.submission_item_id ? (
                              <input
                                type="number"
                                step="any"
                                value={currentNeg !== undefined ? currentNeg : quote.initial_quoted_price}
                                onChange={(e) =>
                                  handleNegotiatedPriceChange(
                                    v.submission_id,
                                    quote.submission_item_id!,
                                    e.target.value
                                  )
                                }
                                className="w-24 text-right px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-200 focus:border-blue-500 bg-white shadow-2xs"
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* Total Amount */}
                          <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                            ₹{(quote.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}

                {/* Sub Total Summary Row */}
                <tr className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-3 text-slate-700 uppercase tracking-wider text-right">
                    Sub Total (INR):
                  </td>
                  {data.vendors.map((v) => (
                    <td key={v.submission_id} colSpan={3} className="px-4 py-3 text-right font-mono text-slate-900 border-l border-slate-200">
                      ₹{v.sub_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* GST Row */}
                <tr className="bg-slate-50 font-semibold text-xs">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-2.5 text-slate-600 uppercase tracking-wider text-right">
                    GST (18%):
                  </td>
                  {data.vendors.map((v) => (
                    <td key={v.submission_id} colSpan={3} className="px-4 py-2.5 text-right font-mono text-slate-600 border-l border-slate-200">
                      ₹{v.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* Grand Total Row */}
                <tr className="bg-slate-900 text-white font-black text-sm">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-4 uppercase tracking-wider text-right text-amber-400">
                    Grand Total (INR):
                  </td>
                  {data.vendors.map((v) => (
                    <td
                      key={v.submission_id}
                      colSpan={3}
                      className={`px-4 py-4 text-right font-mono border-l border-slate-700 ${
                        v.l_rank === "L1" ? "bg-amber-500 text-slate-950 font-black" : ""
                      }`}
                    >
                      <div className="flex items-center justify-end space-x-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-black/20 text-white">
                          {v.l_rank}
                        </span>
                        <span>
                          ₹{v.effective_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Commercial Terms Rows */}
                <tr className="bg-white text-xs">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-2.5 font-bold text-slate-600 text-right">
                    Payment Terms:
                  </td>
                  {data.vendors.map((v) => (
                    <td key={v.submission_id} colSpan={3} className="px-4 py-2.5 text-center text-slate-700 border-l border-slate-200">
                      {v.payment_terms || "Standard as per Tender"}
                    </td>
                  ))}
                </tr>

                <tr className="bg-slate-50 text-xs">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-2.5 font-bold text-slate-600 text-right">
                    Delivery Period:
                  </td>
                  {data.vendors.map((v) => (
                    <td key={v.submission_id} colSpan={3} className="px-4 py-2.5 text-center text-slate-700 border-l border-slate-200">
                      {v.delivery_time || "4-6 Weeks"}
                    </td>
                  ))}
                </tr>

                {/* Save Negotiation Actions */}
                <tr className="bg-blue-50/50 text-xs">
                  <td colSpan={4 + data.custom_columns.length} className="px-4 py-3 font-bold text-blue-900 text-right">
                    Save Negotiated Rates:
                  </td>
                  {data.vendors.map((v) => (
                    <td key={v.submission_id} colSpan={3} className="px-4 py-3 text-center border-l border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleSaveNegotiations(v.submission_id)}
                        disabled={savingNegotiation}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors"
                      >
                        {savingNegotiation ? "Saving..." : `Update ${v.vendor_name}`}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TECHNICAL SPEC MATCH & DISCREPANCY INSPECTOR */}
      {/* ========================================================================= */}
      {activeTab === "discrepancies" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Specification Compliance & Wrong Information Audit
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Side-by-side spec comparison flagging any model downgrades, wrong information (e.g. 16-slice vs 128-slice CT, 60cm vs 70cm bore MRI, 4-wing vs 3-wing fans).
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
              {data.rows.length} Tender Items Verified
            </span>
          </div>

          <div className="space-y-5">
            {data.rows.map((row) => (
              <div key={row.boq_item_id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                {/* Item Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-150">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        Item #{row.s_no}
                      </span>
                      <h4 className="text-base font-black text-slate-900">{row.item_name}</h4>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Required Tender Spec: <strong className="text-slate-900">{row.specifications || "Standard Specifications"}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500">
                      Quantity: <strong>{row.quantity} {row.uom}</strong>
                    </span>
                  </div>
                </div>

                {/* Side-by-Side Vendor Cards for this Line Item */}
                <div className={`grid grid-cols-1 md:grid-cols-${data.vendors.length > 2 ? 3 : data.vendors.length} gap-4`}>
                  {data.vendors.map((v) => {
                    const quote = row.vendor_quotes[v.submission_id];
                    const disc = quote?.discrepancy;
                    const isNonCompliant = quote?.technical_compliance === "NON_COMPLIANT";
                    const isDeviation = quote?.technical_compliance === "DEVIATION";

                    return (
                      <div
                        key={v.submission_id}
                        className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                          isNonCompliant
                            ? "bg-red-50/50 border-red-200"
                            : isDeviation
                            ? "bg-amber-50/50 border-amber-200"
                            : "bg-emerald-50/30 border-emerald-200"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {v.vendor_name} ({v.l_rank})
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isNonCompliant
                                  ? "bg-red-100 text-red-800 border border-red-300"
                                  : isDeviation
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              }`}
                            >
                              {quote?.technical_compliance || "UNKNOWN"}
                            </span>
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-slate-150">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Quoted Make / Model</span>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">{quote?.model_no || "Not Specified"}</p>
                            <p className="text-xs font-mono font-semibold text-slate-700 mt-1">
                              ₹{(quote?.initial_quoted_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                          </div>

                          {/* Discrepancy details */}
                          <div
                            className={`p-3 rounded-xl text-xs ${
                              isNonCompliant
                                ? "bg-red-100/60 text-red-950 border border-red-200"
                                : isDeviation
                                ? "bg-amber-100/60 text-amber-950 border border-amber-200"
                                : "bg-emerald-100/40 text-emerald-950 border border-emerald-200"
                            }`}
                          >
                            <span className="font-bold block mb-0.5">
                              {disc?.title || (isNonCompliant ? "Critical Spec Deviation" : "Specification Verified")}
                            </span>
                            <p className="text-[11px] leading-relaxed">
                              {disc?.explanation ||
                                (isNonCompliant
                                  ? "Quoted model does not fulfill tender specifications."
                                  : "Meets or exceeds all tender parameters.")}
                            </p>
                            {disc?.action_recommended && (
                              <p className="mt-1.5 pt-1.5 border-t border-black/10 text-[11px] font-semibold">
                                Advisory: {disc.action_recommended}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-150 flex justify-end">
                          <button
                            onClick={() => openVendorDetail(v.submission_id, v.vendor_name)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            View Submission Item Details →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: COST-WISE ANALYTICS & VARIANCE */}
      {/* ========================================================================= */}
      {activeTab === "cost" && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Lowest Total (L1)</span>
              <span className="text-2xl font-black font-mono text-emerald-700 mt-1 block">
                ₹{(data.cost_analytics?.lowest_grand_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 block">Vendor: {l1Vendor?.vendor_name}</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Highest Total</span>
              <span className="text-2xl font-black font-mono text-slate-800 mt-1 block">
                ₹{(data.cost_analytics?.highest_grand_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 block">Across all active bidders</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Price Spread</span>
              <span className="text-2xl font-black font-mono text-blue-700 mt-1 block">
                ₹{(data.cost_analytics?.price_spread || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 block">Maximum commercial variance</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Potential L1 Savings</span>
              <span className="text-2xl font-black font-mono text-indigo-700 mt-1 block">
                ₹{(data.cost_analytics?.potential_savings || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 block">Compared to L2 runner-up bid</span>
            </div>
          </div>

          {/* Item Price Variance Table */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Line-Item Rate Variance & Benchmark Spread</h3>
              <p className="text-xs text-slate-500">
                Evaluates pricing uniformity between vendors across each individual equipment line item.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">Lowest Quote (₹)</th>
                    <th className="py-3 px-4 text-right">Highest Quote (₹)</th>
                    <th className="py-3 px-4 text-right">Average Quote (₹)</th>
                    <th className="py-3 px-4 text-right">Spread (₹)</th>
                    <th className="py-3 px-4 text-center">Price Variance (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => {
                    const stats = data.cost_analytics?.item_stats[r.boq_item_id];
                    return (
                      <tr key={r.boq_item_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center font-bold text-slate-400">{r.s_no}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{r.item_name}</td>
                        <td className="py-3.5 px-3 text-center font-medium text-slate-600">{r.quantity} {r.uom}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                          ₹{(stats?.min_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                          ₹{(stats?.max_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                          ₹{(stats?.avg_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-blue-700">
                          ₹{(stats?.spread || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              (stats?.variance_pct || 0) > 20
                                ? "bg-red-100 text-red-800"
                                : (stats?.variance_pct || 0) > 10
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {(stats?.variance_pct || 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Vendor Submission Detail Modal */}
      <VendorSubmissionDetailModal
        isOpen={!!selectedSubmissionId}
        onClose={() => setSelectedSubmissionId(null)}
        boqId={boqId}
        submissionId={selectedSubmissionId}
        vendorName={selectedVendorName}
      />
    </div>
  );
}
