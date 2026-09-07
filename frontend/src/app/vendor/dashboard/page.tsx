"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [docCount, setDocCount] = useState<number>(0);
  const [catalogCount, setCatalogCount] = useState<number>(0);
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

        const docRes = await fetchApi("/api/v1/vendor/documents");
        if (docRes.ok) {
          const docData = await docRes.json();
          setDocCount(docData.length);
        }

        const catRes = await fetchApi("/api/v1/vendor/catalogs");
        if (catRes.ok) {
          const catData = await catRes.json();
          setCatalogCount(catData.length);
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
                <div className="bg-blue-600 text-white font-bold text-lg px-2.5 py-1 rounded-lg">J</div>
                <div>
                  <span className="font-bold text-gray-900 tracking-tight text-base block">JECRC SCM</span>
                  <span className="text-[10px] text-gray-500 block -mt-1">Vendor Portal</span>
                </div>
              </Link>

              <div className="hidden md:flex space-x-1 pl-4 border-l border-gray-200 text-xs font-semibold">
                <Link href="/vendor/dashboard" className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
                  Dashboard
                </Link>
                <Link href="/vendor/profile" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  My Profile (8 Sections)
                </Link>
                <Link href="/vendor/tenders" className="text-blue-600 font-bold hover:text-blue-800 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center space-x-1">
                  <span>⏱️</span>
                  <span>Active Tenders & BOQs</span>
                </Link>
                <Link href="/vendor/recommendations" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  My Proposals
                </Link>
                <Link href="/vendor/documents" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  Documents
                </Link>
                <Link href="/vendor/catalogs" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  Product Catalogs (AI)
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
                    {vendor.vendor_code && (
                      <span className="bg-gray-100 text-gray-700 text-xs font-mono px-2.5 py-1 rounded-md border border-gray-200 font-semibold">
                        {vendor.vendor_code}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {vendor.trade_name ? `${vendor.trade_name} • ` : ""}
                    {vendor.organization_type || "Vendor Organization"}
                    {vendor.city ? ` • ${vendor.city}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    vendor.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                    vendor.status === "REJECTED" ? "bg-red-100 text-red-800 border border-red-200" :
                    "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                    Status: {vendor.status}
                  </span>
                  <span className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    vendor.verification_status === "VERIFIED" ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-gray-100 text-gray-700 border border-gray-200"
                  }`}>
                    {vendor.verification_status}
                  </span>
                </div>
              </div>

              {/* Quick Action Redirect Buttons */}
              <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3">
                <Link
                  href="/vendor/profile"
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all flex items-center space-x-2"
                >
                  <span>👤</span>
                  <span>Master Profile (8 Sections)</span>
                </Link>
                
                <Link
                  href="/vendor/tenders"
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs shadow-sm transition-all flex items-center space-x-2"
                >
                  <span>⏱️</span>
                  <span>Active BOQ Tenders & Bid Lock</span>
                </Link>

                <Link
                  href="/vendor/recommendations"
                  className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-lg text-xs border border-gray-300 transition-all flex items-center space-x-2"
                >
                  <span>📋</span>
                  <span>My Proposals</span>
                </Link>
              </div>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Master Profile</span>
                <div className="text-2xl font-bold text-gray-900">8 Sections</div>
                <Link href="/vendor/profile" className="text-xs text-blue-600 hover:underline font-semibold block pt-1">
                  Manage Profile & Docs →
                </Link>
              </div>

              <div className="bg-white border border-amber-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block">Tender Bidding</span>
                <div className="text-2xl font-bold text-amber-700">Active BOQs</div>
                <Link href="/vendor/tenders" className="text-xs text-amber-700 hover:underline font-bold block pt-1">
                  Submit Bids (Time Lock) →
                </Link>
              </div>

              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Documents</span>
                <div className="text-2xl font-bold text-gray-900">{docCount} Files</div>
                <Link href="/vendor/documents" className="text-xs text-blue-600 hover:underline font-semibold block pt-1">
                  View Compliance Docs →
                </Link>
              </div>

              <div className="bg-white border border-gray-200 p-5 rounded-xl space-y-2 shadow-sm">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Extracted Catalogs</span>
                <div className="text-2xl font-bold text-gray-900">{catalogCount} Catalogs</div>
                <Link href="/vendor/catalogs" className="text-xs text-blue-600 hover:underline font-semibold block pt-1">
                  View Product Extractions →
                </Link>
              </div>
            </div>

            {/* Quick Navigation Cards */}
            <div className="space-y-4 pt-2">
              <h2 className="text-base font-bold text-gray-900">Vendor Portal Navigation</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Card 1 */}
                <Link
                  href="/vendor/profile"
                  className="bg-white border border-gray-200 hover:border-blue-500 p-6 rounded-xl transition-all group space-y-3 shadow-sm hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                    👤
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    1. Vendor Master Profile
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Complete all 8 sections: Identification, Address, Head of Org, Bank Details, Commercials, Classification, Pre-Qual, and Supporting Documents.
                  </p>
                  <span className="text-xs text-blue-600 font-bold block pt-1">
                    Open Profile Form →
                  </span>
                </Link>

                {/* Card 2 */}
                <Link
                  href="/vendor/search"
                  className="bg-white border border-gray-200 hover:border-blue-500 p-6 rounded-xl transition-all group space-y-3 shadow-sm hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                    🎯
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    2. BOQ Submission Portal
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Search active institutional BOQs, inspect itemized requirements, and submit competitive tender proposals for institutional procurement.
                  </p>
                  <span className="text-xs text-blue-600 font-bold block pt-1">
                    Go to BOQ Submissions →
                  </span>
                </Link>

                {/* Card 3 */}
                <Link
                  href="/vendor/recommendations"
                  className="bg-white border border-gray-200 hover:border-blue-500 p-6 rounded-xl transition-all group space-y-3 shadow-sm hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                    📋
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    3. My Proposals & Bids
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Review submitted proposals, view recommendation match scores, track tender evaluation status, and monitor awarded supply contracts.
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
            <h2 className="text-lg font-bold text-gray-900">No Vendor Profile Found</h2>
            <p className="text-xs text-gray-500">
              Your account is not associated with a registered vendor organization yet.
            </p>
            <Link
              href="/vendor/profile"
              className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
            >
              Register & Complete Profile
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
