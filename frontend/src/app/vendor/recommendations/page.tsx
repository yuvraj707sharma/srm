"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

interface RecommendationItem {
  draft_id: string;
  catalog_id: string;
  product_name: string;
  attributes: Record<string, unknown>;
  semantic_score: number;
  composite_score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  match_reasons: string[];
  mismatch_reasons: string[];
}

interface RecommendationResponse {
  request_id: string;
  query: string;
  normalized_requirements: Record<string, unknown>;
  total_candidates_evaluated: number;
  recommendations: RecommendationItem[];
  advisory_notice: string;
}

export default function MinimalWhiteVendorRecommendationsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || query.length < 3) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetchApi("/api/v1/vendor/recommendations", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      if (res.ok) {
        const data = await res.json();
        setResponse(data);
      } else {
        const err = await res.json();
        setError(err.detail?.message || "Failed to generate recommendations.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
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
                <div className="bg-blue-600 text-white font-bold text-lg px-2.5 py-1 rounded-lg shrink-0">J</div>
                <div className="min-w-0">
                  <span className="font-bold text-gray-900 tracking-tight text-xs sm:text-sm block leading-tight">
                    JECRC Medical College Hospital &amp; Research Centre
                  </span>
                  <span className="text-[10px] text-gray-500 block font-medium">A Unit of JECRC • Vendor Portal</span>
                </div>
              </Link>

              <div className="hidden md:flex space-x-2 pl-4 border-l border-gray-200 text-xs font-semibold">
                <Link href="/vendor/dashboard" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3.5 py-2 rounded-lg transition-colors">
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
                  className="bg-blue-50 text-blue-700 px-3.5 py-2 rounded-lg font-bold flex items-center space-x-1"
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
        
        {/* Header Banner */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">My Tender Proposals & AI Match Score</h1>
          <p className="text-xs text-gray-500 mt-1">
            Check catalog match scores, view AI recommendation confidence, and track submitted proposals.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Query Input Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter institutional requirement query or tender specification..."
              className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading || query.length < 3}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? "Evaluating..." : "Check AI Match"}
            </button>
          </form>
        </div>

        {/* Results */}
        {response && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">AI Catalog Evaluation Results</h2>
                <p className="text-xs text-gray-500">Evaluated {response.total_candidates_evaluated} product candidates</p>
              </div>
            </div>

            {response.recommendations.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No high-confidence product matches found for this requirement.</p>
            ) : (
              <div className="space-y-4">
                {response.recommendations.map((rec, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">{rec.product_name}</h3>
                        <span className="text-xs text-gray-500">Catalog ID: {rec.catalog_id}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold">
                          Score: {Math.round(rec.composite_score * 100)}%
                        </span>
                        <span className="px-2.5 py-1 bg-blue-100 border border-blue-200 text-blue-800 rounded-full text-xs font-bold">
                          {rec.confidence} Confidence
                        </span>
                      </div>
                    </div>

                    {rec.match_reasons && rec.match_reasons.length > 0 && (
                      <div className="text-xs text-emerald-800 space-y-1">
                        <span className="font-bold block uppercase text-gray-500 text-[10px]">Match Strengths:</span>
                        {rec.match_reasons.map((m, i) => (
                          <div key={i}>✓ {m}</div>
                        ))}
                      </div>
                    )}
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
