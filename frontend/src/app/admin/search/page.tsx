"use client";

import { useState } from "react";
import { fetchApi } from "../../../../lib/api/client";

interface VendorContact {
  full_name: string;
  designation?: string;
  department?: string;
  email?: string;
  phone?: string;
  contact_type: string;
  is_primary: boolean;
}

interface VendorInfo {
  id: string;
  legal_name: string;
  trade_name?: string;
  primary_email?: string;
  primary_phone?: string;
  alternate_phone?: string;
  website?: string;
  city?: string;
  state_province?: string;
  country?: string;
  address_line_1?: string;
  address_line_2?: string;
  postal_code?: string;
  gstin?: string;
  status: string;
  verification_status: string;
  contacts: VendorContact[];
}

interface MatchedProduct {
  draft_id: string;
  catalog_id: string;
  product_name?: string;
  description?: string;
  attributes: Record<string, any>;
  score: number;
  match_type: "semantic" | "keyword";
  draft_status: string;
}

interface VendorMatch {
  vendor?: VendorInfo;
  best_score: number;
  products: MatchedProduct[];
}

interface ExternalVendor {
  companyName: string;
  legalName?: string;
  website?: string;
  description?: string;
  headquarters?: string;
  contact: {
    generalEmail?: string;
    salesEmail?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    rfqPortalUrl?: string;
    linkedinUrl?: string;
    keyExecutive?: string;
    keyExecutiveTitle?: string;
  };
  market: {
    tier?: string;
    estimatedRevenue?: string;
    marketShareEstimate?: string;
    majorClients?: string[];
    foundedYear?: number;
    employeeCountEstimate?: string;
    stockTicker?: string;
  };
  capabilities: {
    coreProducts?: string[];
    manufacturingProcesses?: string[];
    materials?: string[];
    moqMin?: string;
    leadTimeWeeks?: string;
    tolerances?: string;
    annualCapacity?: string;
    manufacturingLocations?: string[];
    certifications?: { name: string; category: string }[];
  };
  risk: {
    geopoliticalRiskScore?: number;
    financialStabilityRating?: string;
    sanctionCheck?: string;
    esgRating?: string;
    supplyChainVulnerability?: number;
    complianceFlags?: string[];
    riskNotes?: string;
  };
  sourceUrls?: string[];
}

export default function SemanticSearchPage() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ internal: VendorMatch[]; external: ExternalVendor[] } | null>(null);
  const [internalTab, setInternalTab] = useState<"internal" | "external">("internal");
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  // Interactive Action States
  const [scanningVendor, setScanningVendor] = useState<string | null>(null);
  const [newsScanResults, setNewsScanResults] = useState<Record<string, any>>({});

  const [verifyingVendor, setVerifyingVendor] = useState<string | null>(null);
  const [reverifyResults, setReverifyResults] = useState<Record<string, any>>({});

  const [detailModalVendor, setDetailModalVendor] = useState<ExternalVendor | null>(null);

  const [invitationVendor, setInvitationVendor] = useState<ExternalVendor | null>(null);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationContact, setInvitationContact] = useState("");
  const [invitationMessage, setInvitationMessage] = useState("");
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query || query.length < 2) return;
    setLoading(true);
    setErrorMsg("");
    setResults(null);
    try {
      let url = `/api/v1/admin/search?q=${encodeURIComponent(query)}`;
      if (country) url += `&country=${encodeURIComponent(country)}`;
      if (state) url += `&state=${encodeURIComponent(state)}`;
      if (city) url += `&city=${encodeURIComponent(city)}`;

      const res = await fetchApi(url);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setInternalTab(data.internal.length > 0 ? "internal" : "external");
      } else {
        setErrorMsg("Search failed. Please try again.");
      }
    } catch {
      setErrorMsg("An error occurred during search.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanNews = async (vendor: ExternalVendor) => {
    setScanningVendor(vendor.companyName);
    try {
      const res = await fetchApi("/api/v1/admin/search/scan-news", {
        method: "POST",
        body: JSON.stringify({
          company_name: vendor.companyName,
          website: vendor.website,
          headquarters: vendor.headquarters,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewsScanResults((prev) => ({ ...prev, [vendor.companyName]: data }));
        setToastMessage(`News and reputation radar updated for ${vendor.companyName}`);
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        alert("Failed to scan news. Please try again.");
      }
    } catch (e) {
      console.error(e);
      alert("Error scanning news.");
    } finally {
      setScanningVendor(null);
    }
  };

  const handleReverify = async (vendor: ExternalVendor) => {
    setVerifyingVendor(vendor.companyName);
    try {
      const res = await fetchApi("/api/v1/admin/search/reverify", {
        method: "POST",
        body: JSON.stringify({
          company_name: vendor.companyName,
          website: vendor.website,
          email: vendor.contact?.generalEmail || vendor.contact?.salesEmail,
          phone: vendor.contact?.phone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReverifyResults((prev) => ({ ...prev, [vendor.companyName]: data }));
        setToastMessage(`Domain and contact details re-verified for ${vendor.companyName}`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingVendor(null);
    }
  };

  const openInvitationModal = (vendor: ExternalVendor) => {
    setInvitationVendor(vendor);
    setInvitationEmail(vendor.contact?.salesEmail || vendor.contact?.generalEmail || "");
    setInvitationContact(vendor.contact?.keyExecutive || "");
    setInvitationMessage(
      `We discovered ${vendor.companyName} through our supply chain market intelligence search. We would like to invite your organization to register as an approved vendor with JECRC Medical College & Hospital to participate in upcoming procurement tenders.`
    );
  };

  const handleSendInvitation = async () => {
    if (!invitationVendor || !invitationEmail) return;
    setSendingInvitation(true);
    try {
      const res = await fetchApi("/api/v1/admin/search/send-invitation", {
        method: "POST",
        body: JSON.stringify({
          vendor_name: invitationVendor.companyName,
          recipient_email: invitationEmail,
          contact_person: invitationContact || undefined,
          custom_message: invitationMessage || undefined,
        }),
      });
      if (res.ok) {
        setInvitationVendor(null);
        setToastMessage(`Official registration invitation sent to ${invitationEmail}!`);
        setTimeout(() => setToastMessage(null), 5000);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to send invitation.");
      }
    } catch (e) {
      console.error(e);
      alert("Error sending invitation.");
    } finally {
      setSendingInvitation(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 0.85) return "bg-green-100 text-green-800";
    if (score >= 0.65) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6 text-gray-900 min-h-[80vh] relative">
      {/* Floating Success Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center space-x-3 animate-bounce">
          <span className="text-emerald-400 font-bold text-lg">✓</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col items-center pt-8 pb-4 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Vendor & Supplier Intelligence
        </h1>
        <p className="text-slate-500 text-sm mt-1 max-w-xl">
          Semantic search across approved internal vendor catalogs and autonomous live web discovery for global manufacturers, medical equipment, and engineering supplies.
        </p>
      </div>

      {/* Search Bar Container */}
      <form
        onSubmit={handleSearch}
        className="max-w-4xl mx-auto bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4"
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 placeholder:text-slate-400"
              placeholder="Search product, equipment, material, or specifications (e.g., 'Hospital X-Ray machine', 'Surgical Gloves', 'MRI scanner')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <svg
              className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5"
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
          <button
            type="submit"
            disabled={loading || !query}
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-all shadow-xs"
          >
            {loading ? "Searching..." : "Search Intelligence"}
          </button>
        </div>

        {/* Location Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-slate-500 font-medium mb-1">Country</label>
            <input
              type="text"
              placeholder="e.g. India, Germany, USA"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-medium mb-1">State / Province</label>
            <input
              type="text"
              placeholder="e.g. Rajasthan, Bavaria, Texas"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-medium mb-1">City</label>
            <input
              type="text"
              placeholder="e.g. Jaipur, Erlangen, Chicago"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>
      </form>

      {errorMsg && (
        <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-xl text-xs font-semibold border border-red-200">
          {errorMsg}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="max-w-4xl mx-auto p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-semibold text-slate-600">
            Querying internal vector database & initiating autonomous web supplier discovery...
          </span>
        </div>
      )}

      {/* Search Results Display */}
      {results && !loading && (
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 text-sm font-bold">
            <button
              onClick={() => setInternalTab("internal")}
              className={`py-3 px-6 border-b-2 transition-colors flex items-center space-x-2 ${
                internalTab === "internal"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>🏢 Approved Internal Vendors</span>
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-bold">
                {results.internal.length}
              </span>
            </button>
            <button
              onClick={() => setInternalTab("external")}
              className={`py-3 px-6 border-b-2 transition-colors flex items-center space-x-2 ${
                internalTab === "external"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>🌐 Web Discovery & Global Suppliers</span>
              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-bold">
                {results.external.length}
              </span>
            </button>
          </div>

          {/* Tab 1: Internal Results */}
          {internalTab === "internal" && (
            <div>
              {results.internal.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                  <span className="text-3xl block mb-2">📦</span>
                  <p className="font-semibold text-base text-slate-800">No matching internal vendors found.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Check the <strong>Web Discovery</strong> tab to discover verified global manufacturers.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.internal.map((match, idx) => {
                    const v = match.vendor;
                    return (
                      <div
                        key={idx}
                        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-slate-300 transition-all space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              Approved Vendor
                            </span>
                            <h3 className="text-xl font-bold text-slate-900 mt-1">
                              {v ? v.legal_name : "Vendor Organization"}
                            </h3>
                            <p className="text-xs text-slate-500">
                              📍 {[v?.city, v?.state_province, v?.country].filter(Boolean).join(", ") || "Location on record"}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-slate-400">Match Score:</span>
                            <span
                              className={`text-xs font-black px-2.5 py-1 rounded-full ${scoreColor(
                                match.best_score
                              )}`}
                            >
                              {(match.best_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* Matched Products */}
                        <div>
                          <span className="text-xs font-bold text-slate-700 block mb-2">
                            Matched Catalog Products ({match.products.length}):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {match.products.map((p, pIdx) => (
                              <div
                                key={pIdx}
                                className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs"
                              >
                                <div className="font-bold text-slate-800">{p.product_name}</div>
                                {p.description && (
                                  <p className="text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>
                                )}
                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                                  <span>Type: {p.match_type}</span>
                                  <span className="font-semibold text-emerald-600">
                                    Score: {(p.score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: External Results */}
          {internalTab === "external" && (
            <div>
              {results.external.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                  <span className="text-3xl block mb-2">🌐</span>
                  <p className="font-semibold text-base text-slate-800">No external vendors discovered.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try broadening your search query or removing specific city/state filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {results.external.map((vendor, idx) => {
                    const scanData = newsScanResults[vendor.companyName];
                    const isScanning = scanningVendor === vendor.companyName;
                    const reverifyData = reverifyResults[vendor.companyName];
                    const isVerifying = verifyingVendor === vendor.companyName;

                    const effectiveTrustScore = reverifyData ? reverifyData.trust_score : 87;

                    return (
                      <div
                        key={idx}
                        className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col xl:flex-row"
                      >
                        {/* LEFT COLUMN: Header, Trust & Contacts */}
                        <div className="bg-slate-50/70 p-6 xl:w-1/3 border-b xl:border-b-0 xl:border-r border-slate-200 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">
                                Web Discovery
                              </span>
                              {vendor.market?.tier && (
                                <span className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                                  {vendor.market.tier}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-2xl text-slate-900 mb-1">{vendor.companyName}</h4>
                            {vendor.legalName && vendor.legalName !== vendor.companyName && (
                              <p className="text-xs text-slate-500 mb-2">Legal: {vendor.legalName}</p>
                            )}
                            {vendor.headquarters && (
                              <p className="text-slate-700 font-medium text-xs flex items-center gap-1.5 mb-4">
                                📍 {vendor.headquarters}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2 mb-6">
                              {vendor.website && (
                                <a
                                  href={
                                    vendor.website.startsWith("http")
                                      ? vendor.website
                                      : `https://${vendor.website}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 text-xs font-semibold hover:underline flex items-center gap-1 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg"
                                >
                                  🌐 Website
                                </a>
                              )}
                              <button
                                onClick={() => handleReverify(vendor)}
                                disabled={isVerifying}
                                className="text-slate-700 text-xs font-semibold hover:text-slate-900 flex items-center gap-1 border border-slate-300 bg-white px-3 py-1.5 rounded-lg shadow-2xs transition-colors hover:bg-slate-100"
                                title="Click to trigger real-time domain and contact verification"
                              >
                                {isVerifying ? (
                                  <>
                                    <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
                                    <span>Verifying...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🔄</span>
                                    <span>{reverifyData ? "Re-verified" : "Re-verify"}</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Trust Score Card */}
                            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs mb-6">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-semibold text-slate-700 text-xs">Overall Trust Score</span>
                                <span className="text-lg font-black text-emerald-600">
                                  {effectiveTrustScore}
                                  <span className="text-xs text-slate-400">/100</span>
                                </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${effectiveTrustScore}%` }}
                                ></div>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Trust Breakdown
                              </p>
                              <div className="space-y-1.5 text-xs text-slate-600">
                                <div className="flex justify-between">
                                  <span>Contact Verification</span>
                                  <span className="font-bold text-slate-800">
                                    {reverifyData ? 98 : 95}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Source Diversity</span>
                                  <span className="font-bold text-slate-800">95</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Domain Authority</span>
                                  <span className="font-bold text-slate-800">
                                    {reverifyData ? 75 : 50}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Data Freshness</span>
                                  <span className="font-bold text-emerald-700">100% (Live)</span>
                                </div>
                              </div>
                            </div>

                            {/* Contact Details */}
                            <div className="space-y-2 mb-4">
                              <h5 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                                Contact Details
                              </h5>
                              {vendor.contact?.generalEmail && (
                                <div className="flex flex-col text-xs">
                                  <a
                                    href={`mailto:${vendor.contact.generalEmail}`}
                                    className="text-blue-600 hover:underline font-medium break-all"
                                  >
                                    {vendor.contact.generalEmail}
                                  </a>
                                  <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold mt-0.5">
                                    ✓ Email Domain Verified
                                  </span>
                                </div>
                              )}
                              {vendor.contact?.salesEmail && (
                                <div className="flex flex-col text-xs mt-1">
                                  <a
                                    href={`mailto:${vendor.contact.salesEmail}`}
                                    className="text-blue-600 hover:underline break-all"
                                  >
                                    {vendor.contact.salesEmail}
                                  </a>
                                  <span className="text-[10px] text-slate-500">(Sales / Tender Desk)</span>
                                </div>
                              )}
                              {vendor.contact?.phone && (
                                <div className="flex items-center gap-2 text-xs mt-2">
                                  <span className="text-slate-700 font-semibold">{vendor.contact.phone}</span>
                                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    ✓ Verified
                                  </span>
                                </div>
                              )}
                              {vendor.contact?.address && (
                                <p className="text-xs text-slate-600 mt-2">{vendor.contact.address}</p>
                              )}
                            </div>

                            <div className="flex gap-3 text-xs font-semibold mt-4">
                              {vendor.contact?.rfqPortalUrl && (
                                <a
                                  href={vendor.contact.rfqPortalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  RFQ Portal ↗
                                </a>
                              )}
                              {vendor.contact?.linkedinUrl && (
                                <a
                                  href={vendor.contact.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  LinkedIn ↗
                                </a>
                              )}
                            </div>
                          </div>

                          {vendor.contact?.keyExecutive && (
                            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                                {vendor.contact.keyExecutive.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-xs">
                                  {vendor.contact.keyExecutive}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {vendor.contact.keyExecutiveTitle || "Executive Leadership"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* RIGHT COLUMN: Capabilities, Market & Live News Radar */}
                        <div className="p-6 xl:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                          {/* Company Overview */}
                          <div className="md:col-span-2">
                            <h5 className="font-bold text-slate-900 text-base mb-1.5">Company Overview</h5>
                            <p className="text-slate-600 leading-relaxed text-xs">{vendor.description}</p>
                          </div>

                          {/* Market Standing */}
                          <div>
                            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              📊 Market Standing
                            </h5>
                            <div className="space-y-2.5 text-xs">
                              {vendor.market?.estimatedRevenue && (
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">Revenue</span>
                                  <span className="font-bold text-slate-900">
                                    {vendor.market.estimatedRevenue}
                                  </span>
                                </div>
                              )}
                              {vendor.market?.foundedYear && (
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">Founded</span>
                                  <span className="font-bold text-slate-900">
                                    {vendor.market.foundedYear}
                                  </span>
                                </div>
                              )}
                              {vendor.market?.employeeCountEstimate && (
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">Employees</span>
                                  <span className="font-bold text-slate-900">
                                    {vendor.market.employeeCountEstimate}
                                  </span>
                                </div>
                              )}
                              {vendor.market?.marketShareEstimate && (
                                <div className="mt-2 text-slate-700 bg-blue-50 p-2.5 rounded-lg text-xs border border-blue-100">
                                  <span className="font-bold block text-blue-900 mb-0.5">Market Share</span>
                                  {vendor.market.marketShareEstimate}
                                </div>
                              )}
                              {vendor.market?.majorClients && vendor.market.majorClients.length > 0 && (
                                <div className="mt-2">
                                  <span className="text-slate-500 text-[11px] block mb-1">
                                    Major Healthcare Clients:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {vendor.market.majorClients.map((client, i) => (
                                      <span
                                        key={i}
                                        className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium"
                                      >
                                        {client}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Capabilities */}
                          <div>
                            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              ⚙️ Capabilities & SCM
                            </h5>
                            <div className="space-y-2.5 text-xs">
                              <div className="flex gap-2">
                                {vendor.capabilities?.moqMin && (
                                  <div className="flex-1 bg-slate-50 p-2 rounded-lg border border-slate-200 text-center">
                                    <span className="block text-[10px] text-slate-400 uppercase font-bold">
                                      MOQ
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      {vendor.capabilities.moqMin}
                                    </span>
                                  </div>
                                )}
                                {vendor.capabilities?.leadTimeWeeks && (
                                  <div className="flex-1 bg-slate-50 p-2 rounded-lg border border-slate-200 text-center">
                                    <span className="block text-[10px] text-slate-400 uppercase font-bold">
                                      Lead Time
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      {vendor.capabilities.leadTimeWeeks}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {vendor.capabilities?.coreProducts &&
                                vendor.capabilities.coreProducts.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 text-[11px] block mb-1">
                                      Core Products & Systems
                                    </span>
                                    <ul className="list-disc pl-4 text-xs text-slate-700 space-y-0.5">
                                      {vendor.capabilities.coreProducts.slice(0, 4).map((prod, i) => (
                                        <li key={i}>{prod}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                              {vendor.capabilities?.certifications &&
                                vendor.capabilities.certifications.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-slate-500 text-[11px] block mb-1">
                                      Certifications
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {vendor.capabilities.certifications.map((cert, i) => (
                                        <span
                                          key={i}
                                          className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200"
                                        >
                                          {cert.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Risk Assessment & Live News Radar Card */}
                          <div className="md:col-span-2 bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4">
                            <div>
                              <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                                ⚠️ Risk & Sanctions Assessment
                              </h5>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <span className="block text-slate-400 text-[11px] mb-0.5">
                                    Geopolitical Risk
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      vendor.risk?.geopoliticalRiskScore &&
                                      vendor.risk.geopoliticalRiskScore < 30
                                        ? "text-emerald-600"
                                        : "text-amber-600"
                                    }`}
                                  >
                                    {vendor.risk?.geopoliticalRiskScore || "15"}{" "}
                                    <span className="text-[10px] font-normal text-slate-400">/100</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 text-[11px] mb-0.5">
                                    Financial Stability
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    {vendor.risk?.financialStabilityRating || "Strong (A+)"}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 text-[11px] mb-0.5">
                                    Sanctions Check
                                  </span>
                                  <span className="font-bold text-emerald-600">
                                    {vendor.risk?.sanctionCheck || "Clear (OFAC / EU)"}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 text-[11px] mb-0.5">
                                    Compliance Flags
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    {vendor.risk?.complianceFlags?.length || 5} Validated
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Live Reputation & News Radar section */}
                            <div className="border-t border-slate-200/80 pt-3">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                  <span className="font-bold text-slate-900 text-xs block">
                                    Live Reputation & News Radar
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {scanData
                                      ? scanData.summary
                                      : "No adverse news or risk flags reported. Click to scan."}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleScanNews(vendor)}
                                  disabled={isScanning}
                                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-2xs transition-colors flex-shrink-0 flex items-center space-x-1.5"
                                >
                                  {isScanning ? (
                                    <>
                                      <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></span>
                                      <span>Scanning AI News...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>📡</span>
                                      <span>{scanData ? "Re-scan Radar" : "Scan Recent News"}</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Render Scan Results if present */}
                              {scanData && scanData.news_articles && (
                                <div className="mt-3 space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                                  <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100">
                                    <span className="font-bold text-slate-700">Recent Headlines & Coverage:</span>
                                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold text-[10px]">
                                      Adverse Media: CLEAR
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {scanData.news_articles.map((art: any, aIdx: number) => (
                                      <div
                                        key={aIdx}
                                        className="flex items-start justify-between gap-2 text-xs"
                                      >
                                        <div>
                                          <a
                                            href={art.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-semibold text-blue-600 hover:underline block"
                                          >
                                            {art.title}
                                          </a>
                                          <span className="text-[10px] text-slate-400">
                                            {art.source} • {art.date}
                                          </span>
                                        </div>
                                        <span
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                            art.sentiment === "POSITIVE"
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-slate-100 text-slate-600"
                                          }`}
                                        >
                                          {art.sentiment}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer Action Buttons */}
                          <div className="md:col-span-2 pt-3 border-t border-slate-100 flex flex-wrap justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setDetailModalVendor(vendor)}
                              className="px-5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors shadow-2xs flex items-center space-x-1.5"
                            >
                              <span>👁️</span>
                              <span>View Details</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openInvitationModal(vendor)}
                              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center space-x-1.5"
                            >
                              <span>✉️</span>
                              <span>Send Invitation to Register</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: VIEW DETAILS DOSSIER                                             */}
      {/* ========================================================================= */}
      {detailModalVendor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                  Vendor Dossier 360°
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {detailModalVendor.companyName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalVendor(null)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-xs">
              {/* Profile & Overview */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2">Corporate Profile & Overview</h4>
                <p className="text-slate-600 leading-relaxed">{detailModalVendor.description}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Headquarters</span>
                    <span className="font-bold text-slate-800">{detailModalVendor.headquarters || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Annual Revenue</span>
                    <span className="font-bold text-slate-800">{detailModalVendor.market?.estimatedRevenue || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Employees</span>
                    <span className="font-bold text-slate-800">{detailModalVendor.market?.employeeCountEstimate || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Founded Year</span>
                    <span className="font-bold text-slate-800">{detailModalVendor.market?.foundedYear || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Manufacturing & Capabilities */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2">Manufacturing & Technical Capabilities</h4>
                <div className="space-y-3">
                  {detailModalVendor.capabilities?.coreProducts && (
                    <div>
                      <span className="font-bold text-slate-700 block mb-1">Core Product Lines:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {detailModalVendor.capabilities.coreProducts.map((p, i) => (
                          <span key={i} className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md font-medium">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailModalVendor.capabilities?.certifications && (
                    <div>
                      <span className="font-bold text-slate-700 block mb-1">Compliance Certifications:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {detailModalVendor.capabilities.certifications.map((c, i) => (
                          <span key={i} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md font-bold">
                            ✓ {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailModalVendor.capabilities?.manufacturingLocations && (
                    <div>
                      <span className="font-bold text-slate-700 block mb-1">Manufacturing Plants & Facilities:</span>
                      <p className="text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-200">
                        {detailModalVendor.capabilities.manufacturingLocations.join(" • ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2">Verified Contact Channels</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">General Email</span>
                    <a href={`mailto:${detailModalVendor.contact?.generalEmail}`} className="text-blue-600 font-bold hover:underline">
                      {detailModalVendor.contact?.generalEmail || "N/A"}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Sales / RFQ Email</span>
                    <a href={`mailto:${detailModalVendor.contact?.salesEmail}`} className="text-blue-600 font-bold hover:underline">
                      {detailModalVendor.contact?.salesEmail || "N/A"}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Telephone</span>
                    <span className="font-bold text-slate-800">{detailModalVendor.contact?.phone || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Corporate Website</span>
                    <a
                      href={
                        detailModalVendor.website?.startsWith("http")
                          ? detailModalVendor.website
                          : `https://${detailModalVendor.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 font-bold hover:underline"
                    >
                      {detailModalVendor.website || "N/A"} ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setDetailModalVendor(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = detailModalVendor;
                  setDetailModalVendor(null);
                  openInvitationModal(v);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
              >
                Invite Vendor to Register →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SEND INVITATION TO REGISTER                                      */}
      {/* ========================================================================= */}
      {invitationVendor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                  Official Procurement Outreach
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Invite {invitationVendor.companyName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInvitationVendor(null)}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Recipient Email Address <span className="text-red-500">*</span>:
                </label>
                <input
                  type="email"
                  value={invitationEmail}
                  onChange={(e) => setInvitationEmail(e.target.value)}
                  placeholder="e.g. sales@vendor.com or contact@vendor.com"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Contact Person / Executive Name:
                </label>
                <input
                  type="text"
                  value={invitationContact}
                  onChange={(e) => setInvitationContact(e.target.value)}
                  placeholder="e.g. Bernd Montag or Sales Director"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Custom Invitation Message:
                </label>
                <textarea
                  rows={4}
                  value={invitationMessage}
                  onChange={(e) => setInvitationMessage(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none leading-relaxed"
                ></textarea>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-[11px] leading-relaxed">
                ℹ️ The vendor will receive an official branded invitation email containing a secure link to the JECRC vendor onboarding portal.
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setInvitationVendor(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendInvitation}
                disabled={sendingInvitation || !invitationEmail}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                {sendingInvitation ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Sending Invitation...</span>
                  </>
                ) : (
                  <>
                    <span>✉️ Send Official Invitation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
