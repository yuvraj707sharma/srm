"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../../lib/api/client";

interface VendorTender {
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
  allow_download: boolean;
  total_items: number;
  submission_status: "NOT_SUBMITTED" | "SUBMITTED";
  submitted_at?: string;
  grand_total?: number;
}

export default function VendorTendersPage() {
  const [tenders, setTenders] = useState<VendorTender[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTenders();
    const interval = setInterval(() => {
      setTenders((prev) =>
        prev.map((t) => ({
          ...t,
          remaining_seconds: Math.max(0, t.remaining_seconds - 1),
          is_deadline_passed: t.remaining_seconds <= 1 ? true : t.is_deadline_passed,
        }))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadTenders() {
    try {
      setLoading(true);
      const res = await fetchApi("/api/v1/vendor/tenders");
      if (res.ok) {
        setTenders(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "🔒 Submission Closed";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `⏳ ${d}d ${h}h ${m}m remaining`;
    return `⏳ ${h}h ${m}m ${s}s remaining`;
  };

  return (
    <div className="space-y-6 text-slate-900 pb-16 font-sans">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Active BOQ Tenders & Invitations</h1>
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
              Procurement Portal
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review invitations from JECRC Medical College & Hospital, submit commercial quotations before the time-lock, or upload Excel/PDF bids.
          </p>
        </div>
        <div className="flex items-center space-x-3 flex-shrink-0">
          <Link
            href="/vendor/dashboard"
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs border border-slate-300 transition-all shadow-xs"
          >
            <span>🏠</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-semibold">Loading Tender Opportunities...</span>
          </div>
        ) : tenders.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-3 text-2xl">
              📂
            </div>
            <h3 className="text-base font-bold text-slate-800">No Tenders Available Right Now</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              You will automatically receive email invitations when new procurement tenders matching your approved categories are published.
            </p>
            <Link
              href="/vendor/dashboard"
              className="mt-5 inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors"
            >
              <span>← Go to Dashboard</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tenders.map((tender) => {
              const isSubmitted = tender.submission_status === "SUBMITTED";
              const isLocked = tender.is_deadline_passed;

              return (
                <div
                  key={tender.id}
                  className="p-6 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {tender.tender_number}
                      </span>
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {tender.department || "General Procurement"}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {tender.total_items} Line Items
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{tender.title}</h3>
                    {tender.description && (
                      <p className="text-xs text-slate-500 line-clamp-1">{tender.description}</p>
                    )}

                    {/* Deadline Badge */}
                    <div className="pt-1 flex items-center space-x-3 text-xs">
                      {!isLocked ? (
                        <span className="font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          {formatCountdown(tender.remaining_seconds)}
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-300">
                          🔒 Submission Locked (Deadline Passed)
                        </span>
                      )}

                      {tender.deadline_at && (
                        <span className="text-[11px] text-slate-400">
                          Deadline: {new Date(tender.deadline_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Submission Status & Action */}
                  <div className="flex sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 flex-shrink-0">
                    {isSubmitted ? (
                      <div className="text-left sm:text-right">
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          <span>🔒</span>
                          <span>Bid Submitted & Locked</span>
                        </span>
                        <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                          Quoted: ₹{(tender.grand_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        {tender.submitted_at && (
                          <div className="text-[10px] text-slate-400">
                            On {new Date(tender.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-left sm:text-right">
                        <span className="inline-flex items-center px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
                          Ready for Submission
                        </span>
                      </div>
                    )}

                    <Link
                      href={`/vendor/tenders/${tender.id}`}
                      className={`inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                        isSubmitted
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                      }`}
                    >
                      <span>{isSubmitted ? "View Submitted Bid 🔒" : "Review & Submit Bid →"}</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
