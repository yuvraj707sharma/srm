"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../../lib/api/client";

interface BOQSummary {
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
  total_items: number;
  total_submissions: number;
  created_at: string;
}

export default function AdminBOQPage() {
  const [boqs, setBoqs] = useState<BOQSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [extendingBoq, setExtendingBoq] = useState<BOQSummary | null>(null);
  const [extendDays, setExtendDays] = useState(3);
  const [savingExtend, setSavingExtend] = useState(false);
  const [deletingBoq, setDeletingBoq] = useState<BOQSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadBoqs();
    const timer = setInterval(() => {
      setBoqs((prev) =>
        prev.map((b) => ({
          ...b,
          remaining_seconds: Math.max(0, b.remaining_seconds - 1),
          is_deadline_passed: b.remaining_seconds <= 1 ? true : b.is_deadline_passed,
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadBoqs() {
    try {
      setLoading(true);
      const res = await fetchApi("/api/v1/admin/boq");
      if (res.ok) {
        setBoqs(await res.json());
      }
    } catch (err) {
      console.error(err);
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
    if (d > 0) return `⏳ ${d}d ${h}h ${m}m left`;
    return `⏳ ${h}h ${m}m ${s}s left`;
  };

  const handleExtendDeadline = async () => {
    if (!extendingBoq) return;
    setSavingExtend(true);
    try {
      const newDeadline = new Date(Date.now() + extendDays * 24 * 3600 * 1000).toISOString();
      const res = await fetchApi(`/api/v1/admin/boq/${extendingBoq.id}/deadline`, {
        method: "PATCH",
        body: JSON.stringify({ deadline_at: newDeadline }),
      });
      if (res.ok) {
        setExtendingBoq(null);
        await loadBoqs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingExtend(false);
    }
  };

  const handleDeleteBoq = async () => {
    if (!deletingBoq) return;
    setIsDeleting(true);
    try {
      const res = await fetchApi(`/api/v1/admin/boq/${deletingBoq.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeletingBoq(null);
        await loadBoqs();
      }
    } catch (e) {
      console.error("Failed to delete BOQ", e);
    } finally {
      setIsDeleting(false);
    }
  };

  const totalTenders = boqs.length;
  const activeTenders = boqs.filter((b) => b.status === "PUBLISHED" && !b.is_deadline_passed).length;
  const lockedTenders = boqs.filter((b) => b.status === "LOCKED" || b.is_deadline_passed).length;
  const totalBids = boqs.reduce((acc, b) => acc + (b.total_submissions || 0), 0);

  return (
    <div className="space-y-6 text-slate-900 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Tender & BOQ Management</h1>
            <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-200">
              Universal AI System
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Universal format-agnostic ingestion, vendor time-lock bidding, side-by-side Comparative Statements, and automated L1/T1 ranking.
          </p>
        </div>
        <div className="flex items-center space-x-3 flex-shrink-0">
          <Link
            href="/admin/boq/create"
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New BOQ / Tender</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Tenders</span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">{totalTenders}</span>
          </div>
          <div className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center font-bold text-base">
            📑
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider block">Bidding Open (Active)</span>
            <span className="text-xl font-bold text-emerald-700 mt-0.5 block">{activeTenders}</span>
          </div>
          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-base">
            ⏱️
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider block">Time-Locked / Review</span>
            <span className="text-xl font-bold text-amber-700 mt-0.5 block">{lockedTenders}</span>
          </div>
          <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-base">
            🔒
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Vendor Bids Submitted</span>
            <span className="text-xl font-bold text-blue-700 mt-0.5 block">{totalBids}</span>
          </div>
          <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-base">
            📊
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white shadow-xs rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium">Loading Tender Records...</span>
          </div>
        ) : boqs.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100 text-2xl">
              📋
            </div>
            <h3 className="text-lg font-bold text-slate-900">No BOQ Tenders Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Upload your engineering specifications or equipment list in any format (PDF / Excel) to extract items and publish tenders with automatic 3-day time lock.
            </p>
            <Link
              href="/admin/boq/create"
              className="mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-xs hover:bg-blue-700 transition-colors shadow-sm"
            >
              + Create First BOQ
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="px-6 py-4">Tender Info</th>
                  <th className="px-6 py-4">Department & Scope</th>
                  <th className="px-6 py-4">Submission Lock Status</th>
                  <th className="px-6 py-4">Target Vendors</th>
                  <th className="px-6 py-4 text-center">Bids Received</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {boqs.map((boq) => {
                  const isLocked = boq.status === "LOCKED" || boq.is_deadline_passed;
                  const isPublished = boq.status === "PUBLISHED" && !boq.is_deadline_passed;

                  return (
                    <tr key={boq.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/admin/boq/${boq.id}`}
                            className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                          >
                            {boq.tender_number}
                          </Link>
                        </div>
                        <Link
                          href={`/admin/boq/${boq.id}`}
                          className="font-semibold text-slate-900 mt-0.5 text-xs block hover:text-blue-600 transition-colors"
                        >
                          {boq.title}
                        </Link>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {boq.total_items} Line Items
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                          {boq.department || "General"}
                        </span>
                        {boq.description && (
                          <p className="text-[10px] text-slate-500 mt-1 max-w-xs truncate">{boq.description}</p>
                        )}
                      </td>

                      {/* Deadline Countdown & Status */}
                      <td className="px-4 py-3">
                        {isPublished ? (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                              {formatCountdown(boq.remaining_seconds)}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Closes: {boq.deadline_at ? new Date(boq.deadline_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                            </div>
                          </div>
                        ) : isLocked ? (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              🔒 Submission Locked
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1">Ready for Comparative Review</div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Draft (Unpublished)
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {boq.target_audience === "ALL_APPROVED" ? (
                          <span className="inline-flex items-center space-x-1 text-slate-700 text-[10px]">
                            <span>🌐</span>
                            <span>All Approved Vendors</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 text-[10px]">
                            <span>🎯</span>
                            <span>Selected Vendors</span>
                          </span>
                        )}
                      </td>

                      {/* Bids Received */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center font-bold text-[10px] px-2 py-0.5 rounded-full ${
                          boq.total_submissions > 0
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {boq.total_submissions} Bids
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <Link
                          href={`/admin/boq/${boq.id}`}
                          className="inline-flex items-center space-x-1 text-[10px] font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors border border-slate-200 hover:border-blue-300 shadow-2xs"
                          title="View Full BOQ Details & Line Items"
                        >
                          <span>👁️ Details</span>
                        </Link>

                        <Link
                          href={`/admin/boq/${boq.id}/compare`}
                          className="inline-flex items-center space-x-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition-all shadow-xs"
                          title="View Side-by-side Comparative Statement and L1/T1 Rankings"
                        >
                          <span>Comparative (L1/T1)</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>

                        <button
                          onClick={() => setExtendingBoq(boq)}
                          className="inline-flex items-center text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors border border-slate-200"
                          title="Extend Submission Deadline Time"
                        >
                          ⏱️ Time
                        </button>

                        <button
                          onClick={() => setDeletingBoq(boq)}
                          className="inline-flex items-center text-[10px] font-semibold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors border border-red-200 hover:border-red-600"
                          title="Delete BOQ"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extend Deadline Modal */}
      {extendingBoq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Extend Submission Deadline</h3>
            <p className="text-xs text-slate-500 mt-1">
              Extend the time-lock window for tender: <strong>{extendingBoq.title}</strong>
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Add Additional Days:
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
                onClick={() => setExtendingBoq(null)}
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

      {/* Delete Confirmation Modal */}
      {deletingBoq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 text-red-600">Delete BOQ</h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you want to delete the tender: <strong>{deletingBoq.title}</strong>? This action cannot be undone and will permanently delete all associated items, vendor targets, and submissions.
            </p>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeletingBoq(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBoq}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-xs"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
