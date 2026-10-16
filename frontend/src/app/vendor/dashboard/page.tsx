"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

interface VendorProfile {
  id: string;
  vendor_code?: string;
  legal_name: string;
  trade_name?: string;
  organization_type?: string;
  status: string;
  verification_status: string;
  country?: string;
  city?: string;
  primary_email?: string;
}

export default function MinimalWhiteVendorDashboardPage() {
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [tenderCount, setTenderCount] = useState<number>(0);
  const [submittedCount, setSubmittedCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const profRes = await fetchApi("/api/v1/vendor/me");
        if (profRes.ok) {
          const profData = await profRes.json();
          setVendor(profData);
        } else {
          setError("Failed to load vendor profile.");
        }

        const tendersRes = await fetchApi("/api/v1/vendor/tenders");
        if (tendersRes.ok) {
          const tenders = await tendersRes.json();
          const tenderList = Array.isArray(tenders) ? tenders : [];
          setTenderCount(tenderList.length);
          const submitted = tenderList.filter((t: any) => t.submission_status === "SUBMITTED").length;
          setSubmittedCount(submitted);
        }
      } catch (err) {
        setError("An error occurred while loading vendor dashboard.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Loading Vendor Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-6">
              <Link href="/vendor/dashboard" className="flex items-center space-x-2.5">
                <div className="bg-blue-600 text-white font-bold text-lg px-2.5 py-1 rounded-lg shrink-0">J</div>
                <div className="min-w-0">
                  <span className="font-bold text-gray-900 tracking-tight text-xs sm:text-sm block leading-tight">
                    JECRC Medical College Hospital &amp; Research Centre
                  </span>
                  <span className="text-[10px] text-gray-500 block font-medium">A Unit of JECRC • Vendor Procurement Portal</span>
                </div>
              </Link>

              <div className="hidden md:flex space-x-2 pl-4 border-l border-gray-200 text-xs font-semibold">
                <Link href="/vendor/dashboard" className="bg-blue-50 text-blue-700 px-3.5 py-2 rounded-lg font-bold">
                  Dashboard
                </Link>
                <Link
                  href="/vendor/tenders"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-1.5 shadow-xs"
                >
                  <span>⏱️</span>
                  <span>Active Tenders &amp; BOQs</span>
                </Link>
                <Link
                  href="/vendor/tenders?filter=submitted"
                  className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3.5 py-2 rounded-lg transition-colors flex items-center space-x-1"
                >
                  <span>📋</span>
                  <span>My Submitted Proposals</span>
                </Link>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={logout}
                className="text-xs text-red-600 hover:text-red-700 font-semibold bg-red-50 border border-red-200 px-3.5 py-2 rounded-lg transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {vendor ? (
          <div className="space-y-6">
            {/* Vendor Profile Header Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-2xl font-bold text-gray-900">{vendor.legal_name}</h1>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {vendor.trade_name ? `${vendor.trade_name} • ` : ""}
                    {vendor.organization_type || "Registered Vendor Partner"}
                    {vendor.city ? ` • ${vendor.city}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      vendor.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : vendor.status === "REJECTED"
                        ? "bg-red-100 text-red-800 border border-red-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    Status: {vendor.status}
                  </span>
                  <span
                    className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      vendor.verification_status === "VERIFIED"
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {vendor.verification_status}
                  </span>
                </div>
              </div>

              {/* Primary Quick Action Buttons (NO Master Profile) */}
              <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3">
                <Link
                  href="/vendor/tenders"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs shadow-sm transition-all flex items-center space-x-2"
                >
                  <span>⏱️</span>
                  <span>Active BOQ Tenders &amp; Bid Lock</span>
                </Link>

                <Link
                  href="/vendor/tenders?filter=submitted"
                  className="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-lg text-xs border border-gray-300 transition-all flex items-center space-x-2"
                >
                  <span>📋</span>
                  <span>My Submitted Proposals ({submittedCount})</span>
                </Link>
              </div>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Tender Bidding</span>
                <div className="text-2xl font-bold text-gray-900">
                  {tenderCount} Active BOQs
                </div>
                <Link href="/vendor/tenders" className="text-xs text-amber-700 hover:underline font-bold block pt-1">
                  View &amp; Submit Bids →
                </Link>
              </div>

              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">My Submissions</span>
                <div className="text-2xl font-bold text-gray-900">{submittedCount} Submitted</div>
                <Link href="/vendor/tenders?filter=submitted" className="text-xs text-blue-600 hover:underline font-semibold block pt-1">
                  View Sealed Bids →
                </Link>
              </div>

              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Vendor Eligibility</span>
                <div className="text-2xl font-bold text-emerald-700">Verified &amp; Approved</div>
                <span className="text-xs text-gray-500 block pt-1">
                  Eligible for Institutional Supply &amp; BOQ Contracts
                </span>
              </div>
            </div>

            {/* Quick Navigation Cards */}
            <div className="space-y-4 pt-2">
              <h2 className="text-base font-bold text-gray-900">Vendor Portal Quick Access</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Card 1 */}
                <Link
                  href="/vendor/tenders"
                  className="bg-white border border-gray-200 hover:border-amber-500 p-6 rounded-xl transition-all group space-y-3 shadow-sm hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
                    ⏱️
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-amber-600 transition-colors">
                    1. Active BOQ Tenders &amp; Bid Submission
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Inspect hospital BOQ itemized specifications, review clinical/technical requirements verbatim, and submit commercial quotations via Raw Text or Signed PDF before the bid time-lock.
                  </p>
                  <span className="text-xs text-amber-600 font-bold block pt-1">
                    Open Active Tenders →
                  </span>
                </Link>

                {/* Card 2 */}
                <Link
                  href="/vendor/tenders?filter=submitted"
                  className="bg-white border border-gray-200 hover:border-blue-500 p-6 rounded-xl transition-all group space-y-3 shadow-sm hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                    📋
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    2. My Submitted Proposals &amp; Bids
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Review your submitted quotation amounts, unit prices, sealed time-locks, and track procurement evaluation and award decisions.
                  </p>
                  <span className="text-xs text-blue-600 font-bold block pt-1">
                    View My Proposals →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-4 max-w-md mx-auto shadow-sm">
            <div className="text-4xl">🏢</div>
            <h2 className="text-lg font-bold text-gray-900">Loading Vendor Information...</h2>
            <p className="text-xs text-gray-500">
              Please wait while your verified vendor credentials are verified.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
