"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api/client";

interface BOQItemData {
  id: string;
  item_code?: string;
  item_name: string;
  specifications?: string;
  quantity: number;
  uom: string;
  category?: string;
  target_price?: number;
  attributes?: Record<string, any>;
}

interface TargetedVendor {
  id: string;
  legal_name: string;
  status: string;
}

interface SubmissionSummary {
  id: string;
  vendor_organization_id: string;
  vendor_name: string;
  vendor_email?: string;
  status: string;
  submitted_at?: string;
  grand_total?: number;
  submission_type: string;
}

interface BOQDetail {
  id: string;
  tender_number: string;
  title: string;
  department?: string;
  description?: string;
  status: string;
  published_at?: string;
  deadline_at?: string;
  is_deadline_passed: boolean;
  remaining_seconds: number;
  target_audience: string;
  allow_download: boolean;
  custom_columns: string[];
  items: BOQItemData[];
  targeted_vendors?: TargetedVendor[];
  submissions_count: number;
  submissions?: SubmissionSummary[];
}

export default function AdminBOQDetailPage() {
  const params = useParams();
  const router = useRouter();
  const boqId = params?.id as string;

  const [boq, setBoq] = useState<BOQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Extend deadline modal state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState(3);
  const [savingExtend, setSavingExtend] = useState(false);

  useEffect(() => {
    if (boqId) {
      loadDetail();
    }
  }, [boqId]);

  // Live countdown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setBoq((prev) => {
        if (!prev) return null;
        const newRemaining = Math.max(0, prev.remaining_seconds - 1);
        return {
          ...prev,
          remaining_seconds: newRemaining,
          is_deadline_passed: newRemaining <= 0,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadDetail() {
    try {
      setLoading(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}`);
      if (res.ok) {
        const data = await res.json();
        setBoq(data);
      } else {
        console.error("Failed to load BOQ details");
      }
    } catch (err) {
      console.error("Error loading BOQ details:", err);
    } finally {
      setLoading(false);
    }
  }

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "🔒 Time Expired";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `⏳ ${d}d ${h}h ${m}m ${s}s remaining`;
    return `⏳ ${h}h ${m}m ${s}s remaining`;
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await fetchApi(`/api/v1/admin/boq/${boqId}/download-template`);
      if (!res.ok) {
        alert("Failed to download template. Please check server logs.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOQ_Template_${boq?.tender_number || boqId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Error downloading template.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleExtendDeadline = async () => {
    if (!boq) return;
    setSavingExtend(true);
    try {
      const newDeadline = new Date(Date.now() + extendDays * 24 * 3600 * 1000).toISOString();
      const res = await fetchApi(`/api/v1/admin/boq/${boq.id}/deadline`, {
        method: "PATCH",
        body: JSON.stringify({ deadline_at: newDeadline }),
      });
      if (res.ok) {
        setShowExtendModal(false);
        await loadDetail();
      } else {
        alert("Failed to update deadline.");
      }
    } catch (e) {
      console.error(e);
      alert("Error updating deadline.");
    } finally {
      setSavingExtend(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-sm font-semibold text-slate-600">Loading BOQ Specification & Items...</div>
      </div>
    );
  }

  if (!boq) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4 max-w-lg mx-auto mt-12">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-slate-900">BOQ Tender Not Found</h2>
        <p className="text-sm text-slate-500">
          The requested BOQ record does not exist or you may not have permission to view it.
        </p>
        <Link
          href="/admin/boq"
          className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700"
        >
          Return to Tender List
        </Link>
      </div>
    );
  }

  // Filter items
  const categories = Array.from(
    new Set(boq.items.map((i) => i.category).filter((c): c is string => Boolean(c)))
  );

  const filteredItems = boq.items.filter((item) => {
    const matchesSearch =
      searchQuery === "" ||
      item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.item_code && item.item_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.specifications && item.specifications.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "ALL" || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const estimatedTotalBudget = boq.items.reduce(
    (sum, it) => sum + (it.target_price ? it.target_price * it.quantity : 0),
    0
  );

  const isLocked = boq.status === "LOCKED" || boq.is_deadline_passed;
  const isPublished = boq.status === "PUBLISHED" && !boq.is_deadline_passed;

  return (
    <div className="space-y-6 text-slate-900 pb-24">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-slate-500">
        <Link href="/admin/boq" className="hover:text-blue-600 font-medium">
          Tenders & BOQ
        </Link>
        <span>/</span>
        <span className="text-slate-400">{boq.tender_number}</span>
        <span>/</span>
        <span className="font-semibold text-slate-700 truncate max-w-xs">{boq.title}</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                {boq.tender_number}
              </span>
              {isPublished ? (
                <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
                  <span>●</span>
                  <span>{formatCountdown(boq.remaining_seconds)}</span>
                </span>
              ) : isLocked ? (
                <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                  <span>🔒</span>
                  <span>Bidding Locked (Time Expired)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  <span>Draft</span>
                </span>
              )}
              {boq.department && (
                <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-md border border-slate-200">
                  Dept: {boq.department}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {boq.title}
            </h1>

            {boq.description && (
              <p className="text-sm text-slate-600 max-w-3xl leading-relaxed whitespace-pre-line">
                {boq.description}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Link
              href={`/admin/boq/${boq.id}/compare`}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all"
              title="Open comparative statement matrix with L1/T1 badges"
            >
              <span>📊</span>
              <span>Comparative Statement (L1/T1)</span>
            </Link>

            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl font-bold text-xs transition-all shadow-xs"
              title="Download the exact Excel template generated for vendors"
            >
              <span>📥</span>
              <span>{downloadingTemplate ? "Generating..." : "Download Blank Template"}</span>
            </button>

            <button
              onClick={() => setShowExtendModal(true)}
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all"
              title="Extend deadline countdown"
            >
              <span>⏱️</span>
              <span>Extend Time</span>
            </button>

            <Link
              href="/admin/boq"
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-colors"
            >
              <span>← All Tenders</span>
            </Link>
          </div>
        </div>

        {/* Quick Meta Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Total Line Items
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">
              {boq.items.length} Items
            </span>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Est. Target Budget
            </span>
            <span className="text-xl font-bold text-emerald-700 mt-0.5 block">
              {estimatedTotalBudget > 0 ? `₹${estimatedTotalBudget.toLocaleString("en-IN")}` : "Unspecified"}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Vendor Submissions
            </span>
            <span className="text-xl font-bold text-blue-700 mt-0.5 block">
              {boq.submissions_count} Bids Received
            </span>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Target Audience
            </span>
            <span className="text-sm font-bold text-slate-800 mt-1 block">
              {boq.target_audience === "ALL_APPROVED" ? "🌐 All Approved" : "🎯 Selected Vendors"}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Submission Deadline
            </span>
            <span className="text-sm font-bold text-slate-800 mt-1 block">
              {boq.deadline_at
                ? new Date(boq.deadline_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Not Set"}
            </span>
          </div>
        </div>
      </div>

      {/* Custom Columns & Attributes Tag Bar */}
      {boq.custom_columns && boq.custom_columns.length > 0 && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center space-x-3 text-xs">
          <span className="font-bold text-slate-600 flex items-center space-x-1">
            <span>🏷️</span>
            <span>Custom Specification Columns Detected & Extracted:</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {boq.custom_columns.map((col) => (
              <span
                key={col}
                className="bg-white text-slate-800 font-semibold px-2.5 py-1 rounded-md border border-slate-300 shadow-2xs"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Submissions & Vendor Activity Section */}
      {boq.submissions && boq.submissions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold text-slate-900">Vendor Bids Received</span>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {boq.submissions.length}
              </span>
            </div>
            <Link
              href={`/admin/boq/${boq.id}/compare`}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Open Side-by-Side Matrix →
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {boq.submissions.map((sub, idx) => (
              <div
                key={sub.id}
                className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm">{sub.vendor_name}</span>
                    <div className="text-xs text-slate-400 flex items-center space-x-2">
                      <span>Mode: {sub.submission_type}</span>
                      {sub.submitted_at && (
                        <>
                          <span>•</span>
                          <span>
                            {new Date(sub.submitted_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Grand Total</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {sub.grand_total ? `₹${sub.grand_total.toLocaleString("en-IN")}` : "Under Review"}
                    </span>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                    {sub.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill of Quantities / Line Items Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bill of Quantities (Line Items)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Detailed specifications, quantities, and target pricing for this tender.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search item, code, or specs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-56 sm:w-64"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-700 font-medium"
              >
                <option value="ALL">All Categories ({boq.items.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-14 text-center">#</th>
                <th className="px-5 py-3.5">Item Code & Name</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5 max-w-sm">Technical Specifications</th>
                {boq.custom_columns &&
                  boq.custom_columns.map((col) => (
                    <th key={col} className="px-5 py-3.5">
                      {col}
                    </th>
                  ))}
                <th className="px-5 py-3.5 text-center">Qty / UOM</th>
                <th className="px-5 py-3.5 text-right">Target Rate (₹)</th>
                <th className="px-5 py-3.5 text-right">Target Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7 + (boq.custom_columns?.length || 0)}
                    className="p-8 text-center text-slate-400 font-medium"
                  >
                    No matching items found for the search filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const lineTotal = item.target_price ? item.target_price * item.quantity : null;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* S.No */}
                      <td className="px-5 py-3.5 text-center font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* Code & Name */}
                      <td className="px-5 py-3.5">
                        {item.item_code && (
                          <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-block mb-1">
                            {item.item_code}
                          </span>
                        )}
                        <div className="font-bold text-slate-900 text-sm">{item.item_name}</div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-3.5">
                        {item.category ? (
                          <span className="inline-block bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Specifications */}
                      <td className="px-5 py-3.5 max-w-sm text-slate-600 leading-relaxed">
                        {item.specifications || <span className="text-slate-300 italic">As per standard spec</span>}
                      </td>

                      {/* Custom Columns */}
                      {boq.custom_columns &&
                        boq.custom_columns.map((col) => {
                          const val = item.attributes ? item.attributes[col] : null;
                          return (
                            <td key={col} className="px-5 py-3.5 text-slate-700 font-medium">
                              {val !== undefined && val !== null ? String(val) : <span className="text-slate-300">-</span>}
                            </td>
                          );
                        })}

                      {/* Qty & UOM */}
                      <td className="px-5 py-3.5 text-center font-bold text-slate-800">
                        {item.quantity}{" "}
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {item.uom}
                        </span>
                      </td>

                      {/* Target Rate */}
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                        {item.target_price ? (
                          `₹${item.target_price.toLocaleString("en-IN")}`
                        ) : (
                          <span className="text-slate-400 italic">Open</span>
                        )}
                      </td>

                      {/* Target Total */}
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                        {lineTotal ? (
                          `₹${lineTotal.toLocaleString("en-IN")}`
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800">
                  <td colSpan={3} className="px-5 py-3 text-slate-500 uppercase tracking-wider text-[11px]">
                    Showing {filteredItems.length} of {boq.items.length} Items
                  </td>
                  <td colSpan={boq.custom_columns?.length || 0}></td>
                  <td className="px-5 py-3 text-center text-slate-700">
                    Total Qty: {filteredItems.reduce((acc, it) => acc + it.quantity, 0)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500 uppercase text-[11px]">
                    Est. Total Budget:
                  </td>
                  <td className="px-5 py-3 text-right text-emerald-800 text-sm">
                    {estimatedTotalBudget > 0
                      ? `₹${estimatedTotalBudget.toLocaleString("en-IN")}`
                      : "Open Tender"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Extend Deadline Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Extend Submission Deadline</h3>
            <p className="text-xs text-slate-500 mt-1">
              Extend the time-lock window for tender: <strong>{boq.title}</strong>
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Add Additional Days to Lock Window:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExtendDays(days)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        extendDays === days
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      +{days} Days
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Notice: Extending the deadline will automatically re-open bidding if it was previously locked.
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtendDeadline}
                disabled={savingExtend}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              >
                {savingExtend ? "Saving..." : "Confirm Extension"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
