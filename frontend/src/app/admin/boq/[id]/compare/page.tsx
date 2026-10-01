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
  model_no?: string;
  tank_capacity_location?: string;
  payment_terms_sitc?: string;
  payment_terms_gas?: string;
  agreement_tenure?: string;
  lock_in_period?: string;
  civil_work_scope?: string;
  price_escalation?: string;
  mode_of_delivery?: string;
  minimum_expected_volume?: string;
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
  is_disqualified?: boolean;
  disqualification_note?: string | null;
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
  boq_type?: "COMMERCIAL" | "TECHNICAL" | "TECHNOCOMMERCIAL";
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

  // Active view tab: "commercial_lmo" | "matrix" | "advisory" | "discrepancies" | "cost"
  const [activeTab, setActiveTab] = useState<"commercial_lmo" | "advisory" | "matrix" | "discrepancies" | "cost">("advisory");

  // Modal State for Vendor BOQ Detail View
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string | undefined>(undefined);

  // Action loading states
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // View filter
  const [showShortlistedOnly, setShowShortlistedOnly] = useState(false);

  // Disqualification modal state
  const [disqualifyTarget, setDisqualifyTarget] = useState<VendorMeta | null>(null);
  const [disqualifyNote, setDisqualifyNote] = useState("");
  const [isSavingDisqualify, setIsSavingDisqualify] = useState(false);

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

      if (compData.boq_type === "COMMERCIAL") {
        setActiveTab("commercial_lmo");
      }

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
    setShowDownloadMenu(false);
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

  const handlePrintPdf = async () => {
    setShowDownloadMenu(false);
    try {
      setIsDownloadingPdf(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/export-pdf`);
      if (!res.ok) {
        throw new Error("Failed to generate comparative PDF.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Comparative_Statement_${data?.tender_number || "BOQ"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error exporting PDF: " + (err.message || "Failed to download"));
    } finally {
      setIsDownloadingPdf(false);
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

  const handleCloseTender = async () => {
    if (!confirm("Are you sure you want to close tender submissions? This will lock all submissions and freeze comparative pricing.")) return;
    try {
      setIsClosing(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/close`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to close tender submissions.");
      }
      await loadComparativeData();
    } catch (err: any) {
      alert("Error closing tender: " + (err.message || "Failed"));
    } finally {
      setIsClosing(false);
    }
  };

  const handleSimulateBids = async () => {
    setIsSimulating(true);
    try {
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/simulate-dummy-bids`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to simulate bids.");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadComparativeData();
    } catch (err: any) {
      alert("Error simulating bids: " + (err.message || "Failed"));
    } finally {
      setIsSimulating(false);
    }
  };

  const openDisqualifyModal = (vendor: VendorMeta) => {
    setDisqualifyTarget(vendor);
    setDisqualifyNote(vendor.disqualification_note || "");
  };

  const closeDisqualifyModal = () => {
    setDisqualifyTarget(null);
    setDisqualifyNote("");
  };

  const handleSaveDisqualify = async (isDisqualified: boolean) => {
    if (!disqualifyTarget) return;
    setIsSavingDisqualify(true);
    try {
      const res = await fetchApi(
        `/api/v1/admin/boq/${boqId}/submissions/${disqualifyTarget.submission_id}/disqualify`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_disqualified: isDisqualified, note: isDisqualified ? disqualifyNote : null }),
        }
      );
      if (!res.ok) throw new Error("Failed to update disqualification status.");
      closeDisqualifyModal();
      await loadComparativeData();
    } catch (err: any) {
      alert("Error: " + (err.message || "Failed to save."));
    } finally {
      setIsSavingDisqualify(false);
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

  // Vendors shown in the table (respect Shortlisted Only toggle)
  const disqualifiedCount = data.vendors.filter((v) => v.is_disqualified).length;
  const visibleVendors = showShortlistedOnly
    ? data.vendors.filter((v) => !v.is_disqualified)
    : data.vendors;

  return (
    <div className="max-w-[102rem] mx-auto space-y-6 text-slate-900 pb-24 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
            <Link href="/admin/boq" className="text-xs font-semibold text-indigo-600 hover:underline">
              ← Back to BOQs
            </Link>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
              {data.tender_number}
            </span>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
              data.boq_type === "COMMERCIAL"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : data.boq_type === "TECHNICAL"
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-purple-50 text-purple-800 border-purple-200"
            }`}>
              {data.boq_type || "COMMERCIAL"} BOQ
            </span>
            {data.department && (
              <span className="text-xs font-medium text-slate-500">Dept: {data.department}</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Comparative Statement: {data.title}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {data.boq_type === "COMMERCIAL"
              ? "Comprehensive Commercial Evaluation, Recurring Rates, One-Time SITC Charges & Terms Matrix (LMO Format)"
              : "Commercial L1, Technical T1, QCBS Composite Scoring & Specification Discrepancy Analysis"}
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Shortlist View Toggle */}
          {disqualifiedCount > 0 && (
            <button
              onClick={() => setShowShortlistedOnly((p) => !p)}
              className={`inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border ${
                showShortlistedOnly
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="Toggle between all vendors and shortlisted vendors only"
            >
              <span>{showShortlistedOnly ? "✅" : "⚖️"}</span>
              <span>{showShortlistedOnly ? `Shortlisted Only (${data.vendors.length - disqualifiedCount})` : `All Vendors (${disqualifiedCount} disqualified)`}</span>
            </button>
          )}

          {!data.is_locked ? (
            <button
              onClick={handleCloseTender}
              disabled={isClosing}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-xs"
              title="Close bidding submissions early and freeze comparative rates"
            >
              <span>🔒</span>
              <span>{isClosing ? "Closing..." : "Close Submissions (Lock)"}</span>
            </button>
          ) : (
            <span className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs">
              <span>🔒 Submissions Locked</span>
            </span>
          )}

          {data.boq_type !== "COMMERCIAL" && (
            <button
              onClick={handleRunAiAudit}
              disabled={isAuditing}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
              title="Re-verify all quoted makes/models against tender specifications using Gemini AI"
            >
              <span className={isAuditing ? "animate-spin" : ""}>⚡</span>
              <span>{isAuditing ? "Auditing Specifications..." : "Re-run AI Spec Audit"}</span>
            </button>
          )}

          {/* Rapid Test Button: Simulate 3 Vendor Bids */}
          <button
            onClick={handleSimulateBids}
            disabled={isSimulating}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-sm shadow-violet-200"
            title="Rapid Test: Automatically simulate and submit sealed bids from 3 vendors (Inox, Linde, Wilson)"
          >
            <span>{isSimulating ? "⏳" : "⚡"}</span>
            <span>{isSimulating ? "Simulating Bids..." : "Simulate 3 Vendor Bids"}</span>
          </button>

          {/* Download Split Button */}
          <div className="relative">
            <div className="flex rounded-xl overflow-hidden shadow-sm border border-emerald-600">
              <button
                onClick={handleDownloadExcel}
                disabled={isDownloadingExcel || isDownloadingPdf}
                className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all disabled:opacity-50"
              >
                {isDownloadingExcel ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                <span>{isDownloadingExcel ? "Exporting..." : "Download Excel"}</span>
              </button>
              <button
                onClick={() => setShowDownloadMenu((p) => !p)}
                className="px-2.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs transition-all border-l border-emerald-500"
                title="More download options"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showDownloadMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {showDownloadMenu && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <button
                  onClick={handleDownloadExcel}
                  disabled={isDownloadingExcel}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-slate-50 text-left text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
                >
                  <span className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-base">📊</span>
                  <div>
                    <div className="font-bold text-slate-800">Excel (.xlsx)</div>
                    <div className="text-[10px] text-slate-400 font-normal">Formatted spreadsheet with L1/T1 ranks</div>
                  </div>
                </button>
                <div className="border-t border-slate-100"></div>
                <button
                  onClick={handlePrintPdf}
                  disabled={isDownloadingPdf}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-slate-50 text-left text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
                >
                  <span className="w-7 h-7 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-base">📄</span>
                  <div>
                    <div className="font-bold text-slate-800">PDF Report</div>
                    <div className="text-[10px] text-slate-400 font-normal">Print-ready comparative report</div>
                  </div>
                </button>
              </div>
            )}
          </div>
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
      <div className="flex border-b border-slate-200 space-x-2 text-xs font-bold px-2 flex-wrap gap-y-1">
        {data.boq_type === "COMMERCIAL" && (
          <button
            onClick={() => setActiveTab("commercial_lmo")}
            className={`px-4 py-3 rounded-t-2xl transition-all flex items-center space-x-2 ${
              activeTab === "commercial_lmo"
                ? "bg-white text-amber-800 border-t-2 border-x border-slate-200 font-extrabold shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span>🧪</span>
            <span>Official Commercial Statement (LMO Excel Reference)</span>
          </button>
        )}
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
        {data.boq_type !== "COMMERCIAL" && (
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
        )}
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
      {/* TAB: COMMERCIAL / LMO TENDER COMPARATIVE STATEMENT (EXCEL MIRROR) */}
      {/* ========================================================================= */}
      {activeTab === "commercial_lmo" && (
        <div className="space-y-8">
          {/* LMO Highlights Banner */}
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-emerald-50 p-6 rounded-3xl border-2 border-amber-300 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl">🧪</span>
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-200/70 px-2.5 py-0.5 rounded-full">
                  Liquid Medical Oxygen (LMO) Commercial Comparative Statement
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                JECRC Medical College & Hospital Procurement Evaluation
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Evaluates Recurring Supply Rates (LMO Liquid Oxygen), One-time SITC/Installation charges, and PESO compliance terms.
              </p>
            </div>

            {l1Vendor && (
              <div className="p-4 bg-[#FEF08A] rounded-2xl border-2 border-amber-400 text-slate-950 shadow-sm text-right shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 block">
                  Recommended Commercial L-1 Bidder
                </span>
                <span className="text-base font-black block mt-0.5">{l1Vendor.vendor_name}</span>
                <span className="text-xs font-mono font-black text-slate-900">
                  Effective Total: ₹{l1Vendor.effective_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Master LMO Table (Mirroring Comparative Statement of LMO.xlsx) */}
          <div className="bg-white rounded-3xl border border-slate-300 shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                {/* 1. Header Rows (Rows 3-7 from Excel) */}
                <thead className="bg-slate-900 text-white">
                  {/* Row 3: Vendor Column Header */}
                  <tr className="border-b border-slate-700">
                    <th colSpan={3} className="px-4 py-3 text-sm font-black uppercase tracking-wider bg-slate-950">
                      Comparative Particulars
                    </th>
                    {visibleVendors.map((v, idx) => (
                      <th
                        key={v.submission_id}
                        colSpan={3}
                        className={`px-4 py-3 text-center border-l border-slate-700 font-black text-xs ${
                          v.is_disqualified
                            ? "bg-red-900 text-red-200"
                            : v.l_rank === "L1" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-200"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-black/30 font-mono text-xs">
                              {v.is_disqualified ? "DQ" : v.l_rank}
                            </span>
                            <span>Vendor {idx + 1}: {v.vendor_name}</span>
                          </div>
                          {v.is_disqualified ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[9px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-0.5 rounded-full">⛔ DISQUALIFIED</span>
                              {v.disqualification_note && (
                                <span className="text-[9px] italic text-red-300 max-w-[160px] truncate" title={v.disqualification_note}>{v.disqualification_note}</span>
                              )}
                              <button
                                onClick={() => openDisqualifyModal(v)}
                                className="text-[9px] underline text-red-300 hover:text-white mt-0.5"
                              >Edit / Reinstate</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openDisqualifyModal(v)}
                              className="text-[9px] text-slate-400 hover:text-red-300 underline transition-colors"
                            >Disqualify</button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>

                  {/* Row 4: Legal / Registered Name */}
                  <tr className="bg-slate-850 text-slate-300 border-b border-slate-800 text-[11px]">
                    <th colSpan={3} className="px-4 py-2 font-bold text-slate-400">
                      Name of Vendor:
                    </th>
                    {visibleVendors.map((v) => (
                      <th key={v.submission_id} colSpan={3} className={`px-4 py-2 text-center border-l border-slate-700 font-bold ${v.is_disqualified ? "bg-red-950/60 text-red-300 line-through opacity-60" : "text-white"}`}>
                        {v.company_name || v.vendor_name}
                      </th>
                    ))}
                  </tr>

                  {/* Row 5: Contact Person & Phone */}
                  <tr className="bg-slate-850 text-slate-300 border-b border-slate-800 text-[11px]">
                    <th colSpan={3} className="px-4 py-2 font-bold text-slate-400">
                      Contact Person & Phone:
                    </th>
                    {visibleVendors.map((v) => (
                      <th key={v.submission_id} colSpan={3} className={`px-4 py-2 text-center border-l border-slate-700 font-mono font-normal ${v.is_disqualified ? "opacity-40" : ""}`}>
                        {v.contact_no || v.primary_email || "-"}
                      </th>
                    ))}
                  </tr>

                  {/* Row 6: Model No */}
                  <tr className="bg-slate-850 text-slate-300 border-b border-slate-800 text-[11px]">
                    <th colSpan={3} className="px-4 py-2 font-bold text-slate-400">
                      Model No / Make:
                    </th>
                    {visibleVendors.map((v) => (
                      <th key={v.submission_id} colSpan={3} className={`px-4 py-2 text-center border-l border-slate-700 font-semibold ${v.is_disqualified ? "opacity-40 text-red-300" : "text-emerald-300"}`}>
                        {v.model_no || "Liquid Medical Oxygen IP"}
                      </th>
                    ))}
                  </tr>

                  {/* Row 7: Tank Capacity & Location */}
                  <tr className="bg-slate-850 text-slate-300 border-b border-slate-800 text-[11px]">
                    <th colSpan={3} className="px-4 py-2 font-bold text-slate-400">
                      Tank Capacity & Location:
                    </th>
                    {visibleVendors.map((v) => (
                      <th key={v.submission_id} colSpan={3} className={`px-4 py-2 text-center border-l border-slate-700 ${v.is_disqualified ? "opacity-40" : "text-blue-200"}`}>
                        {v.tank_capacity_location || "13 KL (PESO Approved Tank) at Hospital Campus"}
                      </th>
                    ))}
                  </tr>

                  {/* Sub-Header Row: Rate Columns */}
                  <tr className="bg-slate-800 text-slate-300 text-[11px] font-bold border-b border-slate-700">
                    <th className="px-3 py-2 w-12 text-center">#</th>
                    <th className="px-4 py-2 min-w-[240px]">Item Description</th>
                    <th className="px-3 py-2 w-20 text-center">UOM</th>
                    {visibleVendors.map((v) => (
                      <Fragment key={v.submission_id}>
                        <th className={`px-3 py-2 w-28 text-right border-l border-slate-700 ${v.is_disqualified ? "opacity-40" : ""}`}>
                          Quoted (₹)
                        </th>
                        <th className={`px-3 py-2 w-28 text-right bg-blue-900/40 text-blue-200 ${v.is_disqualified ? "opacity-40" : ""}`}>
                          Negotiated (₹)
                        </th>
                        <th className={`px-3 py-2 w-28 text-right ${v.is_disqualified ? "opacity-40" : ""}`}>
                          Total Amount (₹)
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>

                {/* 2. Table Body (Recurring + One-Time + Terms + Ratings) */}
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {/* PART 1: RECURRING SECTION HEADER */}
                  <tr className="bg-amber-100/70 font-black text-amber-950 border-t-2 border-amber-300">
                    <td colSpan={3 + visibleVendors.length * 3} className="px-4 py-2.5 uppercase tracking-wider text-xs">
                      Part 1: Recurring Supply Charges (Gas & Consumables)
                    </td>
                  </tr>

                  {/* Recurring Rows */}
                  {data.rows
                    .filter((r) => {
                      const desc = (r.item_name + " " + r.specifications).toLowerCase();
                      return !desc.includes("installation") && !desc.includes("peso") && !desc.includes("telemetry") && !desc.includes("alarm");
                    })
                    .map((row) => (
                      <tr key={row.boq_item_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-500">
                          {row.s_no}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">
                          {row.item_name}
                          {row.specifications && (
                            <span className="text-[11px] font-normal text-slate-500 block">
                              {row.specifications}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 font-medium">
                          {row.uom} ({row.quantity})
                        </td>

                        {visibleVendors.map((v) => {
                          const quote = row.vendor_quotes[v.submission_id];

                          const quotedPrice = quote?.initial_quoted_price || 0;
                          const negPrice = negotiatedRates[v.submission_id]?.[quote?.submission_item_id || ""] !== undefined
                            ? negotiatedRates[v.submission_id][quote?.submission_item_id || ""]
                            : (quote?.negotiated_price !== undefined ? quote.negotiated_price : quotedPrice);
                          const total = (negPrice && negPrice > 0 ? negPrice : quotedPrice) * row.quantity;

                          return (
                            <Fragment key={v.submission_id}>
                              <td className={`px-3 py-2.5 text-right font-mono border-l border-slate-200 ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : ''}`}>
                                ₹{quotedPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`px-2 py-2 text-right ${v.is_disqualified ? 'bg-red-100/50 opacity-60 text-red-900' : 'bg-blue-50/50'}`}>
                                <input
                                  type="number"
                                  value={negPrice !== undefined ? negPrice : ""}
                                  onChange={(e) =>
                                    quote?.submission_item_id &&
                                    handleNegotiatedPriceChange(v.submission_id, quote.submission_item_id, e.target.value)
                                  }
                                  placeholder={String(quotedPrice)}
                                  disabled={v.is_disqualified}
                                  className="w-24 text-right px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className={`px-3 py-2.5 text-right font-mono font-bold ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : 'text-slate-900'}`}>
                                ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}

                  {/* Recurring Sub Total Row */}
                  <tr className="bg-slate-100 font-bold border-t border-slate-300">
                    <td colSpan={3} className="px-4 py-2.5 text-right uppercase text-slate-700">
                      Sub Total (Recurring Charges):
                    </td>
                    {visibleVendors.map((v) => (
                      <Fragment key={v.submission_id}>
                        <td className={`border-l border-slate-300 ${v.is_disqualified ? 'bg-red-50/70' : ''}`}></td>
                        <td className={`text-center ${v.is_disqualified ? 'bg-red-50/70' : ''}`}>
                          <button
                            type="button"
                            onClick={() => handleSaveNegotiations(v.submission_id)}
                            disabled={savingNegotiation || v.is_disqualified}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold disabled:opacity-50"
                          >
                            Save
                          </button>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : 'text-slate-900'}`}>
                          ₹{v.sub_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </Fragment>
                    ))}
                  </tr>

                  {/* Recurring GST Row */}
                  <tr className="bg-slate-50 text-[11px] font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-right uppercase text-slate-600">
                      Total GST (As per Line Items):
                    </td>
                    {visibleVendors.map((v) => (
                      <Fragment key={v.submission_id}>
                        <td className={`border-l border-slate-200 ${v.is_disqualified ? 'bg-red-50/70' : ''}`}></td>
                        <td className={v.is_disqualified ? 'bg-red-50/70' : ''}></td>
                        <td className={`px-3 py-2 text-right font-mono ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : 'text-slate-700'}`}>
                          ₹{v.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </Fragment>
                    ))}
                  </tr>

                  {/* PART 2: ONE-TIME / SITC CHARGES SECTION */}
                  <tr className="bg-amber-100/70 font-black text-amber-950 border-t-2 border-amber-300">
                    <td colSpan={3 + visibleVendors.length * 3} className="px-4 py-2.5 uppercase tracking-wider text-xs">
                      Part 2: One-Time / SITC Installation & Commissioning Charges
                    </td>
                  </tr>

                  {/* One-time Items */}
                  {data.rows
                    .filter((r) => {
                      const desc = (r.item_name + " " + r.specifications).toLowerCase();
                      return desc.includes("installation") || desc.includes("peso") || desc.includes("telemetry") || desc.includes("alarm");
                    })
                    .map((row) => (
                      <tr key={row.boq_item_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-500">
                          {row.s_no}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">
                          {row.item_name}
                          {row.specifications && (
                            <span className="text-[11px] font-normal text-slate-500 block">
                              {row.specifications}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 font-medium">
                          {row.uom} ({row.quantity})
                        </td>

                        {visibleVendors.map((v) => {
                          const quote = row.vendor_quotes[v.submission_id];
                          const quotedPrice = quote?.initial_quoted_price || 0;
                          const negPrice = negotiatedRates[v.submission_id]?.[quote?.submission_item_id || ""] !== undefined
                            ? negotiatedRates[v.submission_id][quote?.submission_item_id || ""]
                            : (quote?.negotiated_price !== undefined ? quote.negotiated_price : quotedPrice);
                          const total = (negPrice && negPrice > 0 ? negPrice : quotedPrice) * row.quantity;

                          return (
                            <Fragment key={v.submission_id}>
                              <td className={`px-3 py-2.5 text-right font-mono border-l border-slate-200 ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : ''}`}>
                                ₹{quotedPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`px-2 py-2 text-right ${v.is_disqualified ? 'bg-red-100/50 opacity-60 text-red-900' : 'bg-blue-50/50'}`}>
                                <input
                                  type="number"
                                  value={negPrice !== undefined ? negPrice : ""}
                                  onChange={(e) =>
                                    quote?.submission_item_id &&
                                    handleNegotiatedPriceChange(v.submission_id, quote.submission_item_id, e.target.value)
                                  }
                                  placeholder={String(quotedPrice)}
                                  disabled={v.is_disqualified}
                                  className="w-24 text-right px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className={`px-3 py-2.5 text-right font-mono font-bold ${v.is_disqualified ? 'bg-red-50/70 opacity-60 text-red-900' : 'text-slate-900'}`}>
                                ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}

                  {/* Grand Total Row */}
                  <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950">
                    <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-amber-400 tracking-wider">
                      Grand Total Quoted:
                    </td>
                    {visibleVendors.map((v) => (
                      <Fragment key={v.submission_id}>
                        <td className={`border-l border-slate-700 ${v.is_disqualified ? 'bg-red-950/60' : ''}`}></td>
                        <td className={v.is_disqualified ? 'bg-red-950/60' : ''}></td>
                        <td
                          className={`px-3 py-3.5 text-right font-mono font-black text-sm ${
                            v.is_disqualified ? "bg-red-950/60 text-red-300 opacity-60" : v.l_rank === "L1" ? "bg-[#FEF08A] text-slate-950" : "text-white"
                          }`}
                        >
                          ₹{v.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </Fragment>
                    ))}
                  </tr>

                  {/* PART 3: COMMERCIAL TERMS MATRIX */}
                  <tr className="bg-slate-800 text-white font-black uppercase text-xs">
                    <td colSpan={3 + visibleVendors.length * 3} className="px-4 py-2.5 tracking-wider">
                      Part 3: Commercial Terms & Scope Conditions
                    </td>
                  </tr>

                  {/* Terms rows */}
                  {[
                    { label: "Payment Terms (SITC / Installation)", key: "payment_terms_sitc", fallback: "30 Days after installation" },
                    { label: "Payment Terms (Gas Supply)", key: "payment_terms_gas", fallback: "30 Days against monthly invoice" },
                    { label: "Delivery Lead Time", key: "delivery_time", fallback: "4 to 6 Weeks" },
                    { label: "Agreement Tenure", key: "agreement_tenure", fallback: "10 Years" },
                    { label: "Lock-in Period", key: "lock_in_period", fallback: "10 Years" },
                    { label: "Scope of Civil Work", key: "civil_work_scope", fallback: "Hospital Scope" },
                    { label: "Price Escalation Clause", key: "price_escalation", fallback: "Fixed for 2 years, 5% Y on Y" },
                    { label: "Mode of Delivery", key: "mode_of_delivery", fallback: "Weighment Basis" },
                    { label: "Minimum Expected Volume", key: "minimum_expected_volume", fallback: "Review after 2.5 Years" },
                  ].map((term, i) => (
                    <tr key={term.key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-700 border-r border-slate-200">
                        {term.label}:
                      </td>
                      {visibleVendors.map((v) => {
                        const val = (v as any)[term.key] || (v as any)[term.key.replace("payment_terms_sitc", "payment_terms")] || term.fallback;
                        return (
                          <td key={v.submission_id} colSpan={3} className={`px-4 py-2.5 text-center border-l border-slate-200 font-medium ${v.is_disqualified ? 'bg-red-50/70 text-red-900 opacity-60' : 'text-slate-800'}`}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* PART 4: RATINGS & RANKINGS */}
                  <tr className="bg-slate-800 text-white font-black uppercase text-xs">
                    <td colSpan={3 + visibleVendors.length * 3} className="px-4 py-2.5 tracking-wider">
                      Part 4: Technical & Commercial Ratings
                    </td>
                  </tr>
                  <tr className="bg-white border-b border-slate-200">
                    <td colSpan={3} className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200">
                      Technical Evaluation Rating:
                    </td>
                    {visibleVendors.map((v) => (
                      <td key={v.submission_id} colSpan={3} className={`px-4 py-3 text-center border-l border-slate-200 font-bold ${v.is_disqualified ? 'bg-red-50/70 text-red-900 opacity-60' : 'text-emerald-700'}`}>
                        {v.is_disqualified ? 'Disqualified' : 'Qualified (1)'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white border-b-2 border-slate-300">
                    <td colSpan={3} className="px-4 py-3 font-bold text-slate-900 border-r border-slate-200">
                      Commercial Rating (Ranking):
                    </td>
                    {visibleVendors.map((v) => (
                      <td
                        key={v.submission_id}
                        colSpan={3}
                        className={`px-4 py-3 text-center border-l border-slate-200 font-black text-sm ${
                          v.is_disqualified
                            ? "bg-red-100/70 text-red-900"
                            : v.l_rank === "L1"
                            ? "bg-[#FEF08A] text-slate-950 font-black"
                            : "bg-slate-50 text-slate-800"
                        }`}
                      >
                        {v.is_disqualified ? "⛔ DISQUALIFIED" : (
                          <>{v.l_rank} {v.l_rank === "L1" && "(Lowest Quoted Bidder)"}</>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Block (Mirroring Bottom of Comparative Statement of LMO.xlsx) */}
            <div className="p-8 bg-slate-50 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-6">
                Official Sign-off & Purchase Committee Approvals
              </span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                <div className="border-t-2 border-slate-300 pt-3">
                  <span className="text-xs font-bold text-slate-800 block">Prepared By</span>
                  <span className="text-[10px] text-slate-500 block">Procurement Officer</span>
                </div>
                <div className="border-t-2 border-slate-300 pt-3">
                  <span className="text-xs font-bold text-slate-800 block">Checked By</span>
                  <span className="text-[10px] text-slate-500 block">Biomedical Engineer / MGPS</span>
                </div>
                <div className="border-t-2 border-slate-300 pt-3">
                  <span className="text-xs font-bold text-slate-800 block">Verified By</span>
                  <span className="text-[10px] text-slate-500 block">Chief Financial Officer (CFO)</span>
                </div>
                <div className="border-t-2 border-slate-300 pt-3">
                  <span className="text-xs font-bold text-slate-800 block">Approved By</span>
                  <span className="text-[10px] text-slate-500 block">Director / Purchase Committee</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <span className="text-[10px] text-slate-500 block">Includes GST</span>
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
                  <span className="text-[10px] text-slate-500 block">Includes GST</span>
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
                    Total GST:
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

      {/* Close download menu on outside click */}
      {showDownloadMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
      )}

      {/* ============================================================ */}
      {/* DISQUALIFICATION MODAL                                        */}
      {/* ============================================================ */}
      {disqualifyTarget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className={`p-5 ${disqualifyTarget.is_disqualified ? "bg-orange-50 border-b border-orange-200" : "bg-red-50 border-b border-red-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${disqualifyTarget.is_disqualified ? "bg-orange-100" : "bg-red-100"}`}>
                    {disqualifyTarget.is_disqualified ? "🔄" : "⛔"}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {disqualifyTarget.is_disqualified ? "Edit Disqualification" : "Disqualify Vendor"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{disqualifyTarget.vendor_name}</p>
                  </div>
                </div>
                <button onClick={closeDisqualifyModal} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm transition-colors">✕</button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Reason for Disqualification <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={disqualifyNote}
                  onChange={(e) => setDisqualifyNote(e.target.value)}
                  placeholder="e.g. Price too high, non-compliant with PESO norms, incomplete documentation..."
                  rows={4}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none text-slate-800 placeholder:text-slate-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  This note will be saved and shown on the comparison column header for reference.
                </p>
              </div>

              {disqualifyTarget.is_disqualified && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-800">
                    ✅ You can also <strong>reinstate</strong> this vendor — it will remove the disqualification flag and note.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 pb-5 flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {disqualifyTarget.is_disqualified && (
                  <button
                    onClick={() => handleSaveDisqualify(false)}
                    disabled={isSavingDisqualify}
                    className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isSavingDisqualify ? "Saving..." : "✅ Reinstate Vendor"}
                  </button>
                )}
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={closeDisqualifyModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveDisqualify(true)}
                  disabled={isSavingDisqualify || !disqualifyNote.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isSavingDisqualify ? "Saving..." : "⛔ Confirm Disqualify"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print-only CSS for PDF export */}
      <style>{`
        @media print {
          body { font-size: 10px !important; }
          nav, header, footer, .no-print { display: none !important; }
          .print\\:hidden { display: none !important; }
          button, [role="button"] { display: none !important; }
          table { border-collapse: collapse !important; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid #cbd5e1 !important; padding: 4px 6px !important; font-size: 9px !important; }
          h1 { font-size: 14px !important; margin-bottom: 4px !important; }
          .space-y-6 > * { margin-top: 12px !important; }
          .overflow-x-auto { overflow: visible !important; }
          @page { margin: 1.2cm; size: A3 landscape; }
        }
      `}</style>
    </div>
  );
}
