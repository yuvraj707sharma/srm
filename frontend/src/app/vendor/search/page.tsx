"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

interface SearchHit {
  id: string;
  catalog_id: string;
  product_name: string;
  attributes: string;
  score: number;
}

export default function MinimalWhiteVendorSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searched, setSearched] = useState(false);
  const { logout } = useAuth();

  useEffect(() => {
    async function checkApproval() {
      try {
        const profRes = await fetchApi("/api/v1/vendor/me");
        if (profRes.ok) {
          const data = await profRes.json();
          setProfile(data);
          if (data.status !== "APPROVED") {
            router.push("/vendor/profile");
          }
        }
      } catch (e) {}
    }
    checkApproval();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setMsg(null);
    setSearched(true);
    
    try {
      const res = await fetchApi("/api/v1/vendor/search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 20 }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || "Search failed." });
        setResults([]);
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error connecting to search service." });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-6">
              <Link href={profile?.status === "APPROVED" ? "/vendor/dashboard" : "/vendor/profile"} className="flex items-center space-x-2.5">
                <div className="bg-blue-600 text-white font-bold text-lg px-2.5 py-1 rounded-lg">J</div>
                <div>
                  <span className="font-bold text-gray-900 tracking-tight text-base block">JECRC SCM</span>
                  <span className="text-[10px] text-gray-500 block -mt-1">Vendor Portal</span>
                </div>
              </Link>

              <div className="hidden md:flex space-x-1 pl-4 border-l border-gray-200 text-xs font-semibold">
                {profile?.status === "APPROVED" && (
                  <Link href="/vendor/dashboard" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                    Dashboard
                  </Link>
                )}
                <Link href="/vendor/profile" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  {profile?.status === "APPROVED" ? "My Profile (8 Sections)" : "Vendor Registration"}
                </Link>
                {profile?.status === "APPROVED" && (
                  <>
                    <Link href="/vendor/search" className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
                      BOQ Submissions
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
                  </>
                )}
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
        
        {/* Header Banner */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">BOQ Submissions & Product Search</h1>
          <p className="text-xs text-gray-500 mt-1">
            Search active institutional BOQ requirements, analyze specifications, and check catalog matches.
          </p>
        </div>

        {msg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center space-x-2">
            <span>⚠️</span>
            <span>{msg.text}</span>
          </div>
        )}

        {/* Search Bar Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search BOQ items, equipment models, or specifications..."
              className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search BOQ Items"}
            </button>
          </form>
        </div>

        {/* Results */}
        {searched && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900">Search Results ({results.length})</h2>

            {results.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No matching BOQ line items found for "{query}".</p>
            ) : (
              <div className="space-y-3">
                {results.map((r) => (
                  <div key={r.id} className="bg-gray-50 border border-gray-200 p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{r.product_name}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{r.attributes}</p>
                    </div>
                    <span className="text-xs text-blue-800 font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                      Match: {Math.round(r.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
