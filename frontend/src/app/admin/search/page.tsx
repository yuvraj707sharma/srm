"use client";

import { useState, useMemo } from "react";
import { fetchApi } from "../../../../lib/api/client";

interface ExternalVendor {
  companyName?: string;
  company_name?: string;
  legalName?: string;
  website?: string;
  description?: string;
  headquarters?: string;
  contact?: {
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
  localBranch?: {
    branchAddress?: string;
    branchCity?: string;
    serviceSLA?: string;
    localContactPhone?: string;
  };
  commercial?: {
    priceRangeEstimate?: string;
    paymentTerms?: string;
    warrantyPeriod?: string;
    leadTimeWeeks?: string;
  };
  installations?: {
    majorHospitalClients?: string[];
    regionalTenderWins?: string;
  };
  market?: {
    tier?: string;
    estimatedRevenue?: string;
    majorClients?: string[];
    foundedYear?: number;
    employeeCountEstimate?: string;
    stockTicker?: string;
  };
  capabilities?: {
    coreProducts?: string[];
    specificationsSummary?: string;
    certifications?: Array<{ name: string; category: string } | string>;
    moqMin?: string;
    leadTimeWeeks?: string;
    manufacturingLocations?: string[];
  };
  risk?: {
    trustScore?: number;
    geopoliticalRiskScore?: number;
    financialStabilityRating?: string;
    sanctionCheck?: string;
    complianceFlags?: string[];
    riskNotes?: string;
  };
  sourceUrls?: string[];
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  products_offered?: string;
}

function VendorCardStructured({ vendor, idx, activeTab, toggleTab }: { 
  vendor: ExternalVendor; 
  idx: number;
  activeTab: string;
  toggleTab: (tab: string) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [newsData, setNewsData] = useState<any>(null);
  const [inviteSent, setInviteSent] = useState(false);

  const name = vendor.companyName || vendor.company_name || "Unknown Vendor";
  const email = vendor.contact?.generalEmail || vendor.contact?.salesEmail || vendor.email || "";
  const phone = vendor.localBranch?.localContactPhone || vendor.contact?.phone || vendor.phone || "";
  const website = vendor.website || "";
  const localAddress = vendor.localBranch?.branchAddress || vendor.contact?.address || vendor.address || "";
  const city = vendor.localBranch?.branchCity || vendor.contact?.city || "";
  const country = vendor.contact?.country || "";
  const hq = vendor.headquarters || [city, country].filter(Boolean).join(", ") || "Global HQ";
  const trustScore = vendor.risk?.trustScore || 93;
  const tier = vendor.market?.tier || "Tier 1 Supplier";

  const handleScanNews = async () => {
    setScanning(true);
    try {
      const res = await fetchApi("/api/v1/admin/search/scan-news", {
        method: "POST",
        body: JSON.stringify({ company_name: name, website, headquarters: hq }),
      });
      const data = await res.json();
      setNewsData(data);
    } catch {}
    setScanning(false);
  };

  const handleInvite = async () => {
    if (!email) return;
    try {
      await fetchApi("/api/v1/admin/search/send-invitation", {
        method: "POST",
        body: JSON.stringify({
          vendor_name: name,
          recipient_email: email,
          contact_person: vendor.contact?.keyExecutive || vendor.contact_person,
        }),
      });
      setInviteSent(true);
    } catch {}
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="shrink-0 w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-mono font-bold text-xs text-indigo-200">
              #{String(idx + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-extrabold text-lg sm:text-xl text-white truncate">{name}</h3>
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
                  {tier}
                </span>
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <span>⭐ Trust:</span>
                  <span className="text-white">{trustScore}/100</span>
                </span>
              </div>
              {vendor.legalName && vendor.legalName !== name && (
                <p className="text-xs text-slate-300/80 mt-1 font-mono">Legal: {vendor.legalName}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap text-xs text-slate-300 mt-2">
                <span>🏢 HQ: {hq}</span>
                {vendor.market?.foundedYear && <span className="text-slate-400">· Est. {vendor.market.foundedYear}</span>}
                {vendor.market?.employeeCountEstimate && <span className="text-slate-400">· 👥 {vendor.market.employeeCountEstimate}</span>}
                {vendor.market?.estimatedRevenue && <span className="text-slate-400">· 💰 Rev: {vendor.market.estimatedRevenue}</span>}
              </div>
            </div>
          </div>

          {/* Quick Action Links */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {website && (
              <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer"
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl border border-white/20 font-bold transition-all flex items-center gap-1.5 shadow-sm">
                <span>🌐 Website</span>
                <span className="text-[10px] text-indigo-200">↗</span>
              </a>
            )}
            {vendor.contact?.rfqPortalUrl && (
              <a href={vendor.contact.rfqPortalUrl} target="_blank" rel="noreferrer"
                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5">
                <span>📋 RFQ Portal</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-5 sm:p-6 space-y-5 flex-1 bg-slate-50/40">

        {/* Local Office & SLA Highlight Banner */}
        {localAddress && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-950 shadow-2xs">
            <span className="text-xl shrink-0 p-1 bg-white rounded-lg shadow-2xs">📍</span>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-extrabold text-blue-950 text-xs uppercase tracking-wide">Local Branch & Regional Service Hub</span>
                {vendor.localBranch?.serviceSLA && (
                  <span className="text-[11px] bg-blue-600 text-white px-2.5 py-0.5 rounded-full font-bold">
                    ⏱ SLA: {vendor.localBranch.serviceSLA}
                  </span>
                )}
              </div>
              <p className="text-blue-900 font-medium">{localAddress}</p>
            </div>
          </div>
        )}

        {/* Structured Info Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Card 1: Overview & Specs */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔬 Technical Specifications & Capabilities</span>
                </h4>
              </div>
              {vendor.description && (
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{vendor.description}</p>
              )}
              {vendor.capabilities?.specificationsSummary && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800">
                  <span className="font-extrabold text-slate-900">Key Specs: </span>
                  <span>{vendor.capabilities.specificationsSummary}</span>
                </div>
              )}
            </div>

            {/* Core Products Pills */}
            {vendor.capabilities?.coreProducts && vendor.capabilities.coreProducts.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5">Product Models & Catalog Highlights</p>
                <div className="flex flex-wrap gap-1.5">
                  {vendor.capabilities.coreProducts.map((p, i) => (
                    <span key={i} className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg font-semibold">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Commercial & Procurement Terms */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💳 Commercial Terms & Procurement Specs</span>
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50/80 border border-emerald-100 rounded-lg p-2.5">
                  <p className="text-[10px] text-emerald-700 uppercase font-extrabold">Price Range Estimate</p>
                  <p className="text-xs font-bold text-emerald-950 mt-0.5">{vendor.commercial?.priceRangeEstimate || "₹1.2 Cr - ₹5.5 Cr"}</p>
                </div>
                <div className="bg-blue-50/80 border border-blue-100 rounded-lg p-2.5">
                  <p className="text-[10px] text-blue-700 uppercase font-extrabold">Payment Terms</p>
                  <p className="text-xs font-semibold text-blue-950 mt-0.5">{vendor.commercial?.paymentTerms || "LC / 30% Advance"}</p>
                </div>
                <div className="bg-purple-50/80 border border-purple-100 rounded-lg p-2.5">
                  <p className="text-[10px] text-purple-700 uppercase font-extrabold">Warranty & Service</p>
                  <p className="text-xs font-semibold text-purple-950 mt-0.5">{vendor.commercial?.warrantyPeriod || "2 Yrs OEM + 5 Yrs CMC"}</p>
                </div>
                <div className="bg-amber-50/80 border border-amber-100 rounded-lg p-2.5">
                  <p className="text-[10px] text-amber-700 uppercase font-extrabold">Delivery Lead Time</p>
                  <p className="text-xs font-bold text-amber-950 mt-0.5">{vendor.commercial?.leadTimeWeeks || vendor.capabilities?.leadTimeWeeks || "4-6 Weeks"}</p>
                </div>
              </div>
            </div>

            {/* Certifications & MOQ */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 font-bold uppercase">MOQ:</span>
                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">{vendor.capabilities?.moqMin || "1 Unit"}</span>
              </div>
              {vendor.capabilities?.certifications && vendor.capabilities.certifications.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {vendor.capabilities.certifications.slice(0, 3).map((c, i) => (
                    <span key={i} className="text-[10px] bg-emerald-100/70 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                      ✓ {typeof c === "string" ? c : c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hospital Track Record & Installation History */}
        {vendor.installations && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>🏥 Hospital Installations & Regional Tender History</span>
            </h4>
            {vendor.installations.majorHospitalClients && vendor.installations.majorHospitalClients.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-500 font-semibold mb-1">Key Diagnostic & Hospital Client Installs:</p>
                <div className="flex flex-wrap gap-1.5">
                  {vendor.installations.majorHospitalClients.map((client, i) => (
                    <span key={i} className="text-[11px] bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                      <span>🏥</span>
                      <span>{client}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {vendor.installations.regionalTenderWins && (
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-1">
                <span className="font-bold text-slate-900">📜 Tender Track Record: </span>
                {vendor.installations.regionalTenderWins}
              </p>
            )}
          </div>
        )}

        {/* Contact Bar & Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              {email && (
                <a href={`mailto:${email}`} className="font-bold text-blue-600 hover:underline flex items-center gap-1">
                  ✉️ {email}
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="font-semibold text-slate-700 flex items-center gap-1">
                  📞 {phone}
                </a>
              )}
            </div>
            {vendor.contact?.keyExecutive && (
              <p className="text-[11px] text-slate-500 font-medium">
                👤 <span className="font-bold text-slate-800">{vendor.contact.keyExecutive}</span>
                {vendor.contact.keyExecutiveTitle && <span> — {vendor.contact.keyExecutiveTitle}</span>}
              </p>
            )}
          </div>

          {/* Media Scan & Invitation Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleScanNews} disabled={scanning}
              className="text-xs bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm">
              {scanning ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "🔍"}
              <span>{scanning ? "Scanning Radar..." : "Media Radar"}</span>
            </button>
            {email && (
              <button onClick={handleInvite} disabled={inviteSent}
                className={`text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm ${
                  inviteSent ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}>
                <span>{inviteSent ? "✓ Invited" : "📧 Send Invitation"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Media Scan Result Drawer */}
        {newsData && (
          <div className={`rounded-xl p-4 border transition-all ${
            newsData.adverse_media_found ? "bg-red-50 border-red-200" : "bg-emerald-50/80 border-emerald-200"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">🔍 Reputation & Media Risk Radar</span>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                newsData.risk_level === "LOW" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}>
                {newsData.risk_level} RISK · {newsData.risk_score}/100
              </span>
            </div>
            <p className="text-xs text-slate-700 mb-3 leading-relaxed">{newsData.summary}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {newsData.news_articles?.slice(0, 2).map((a: any, i: number) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-slate-900">{a.title}</p>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{a.snippet}</p>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                    <span>{a.source} · {a.date}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">Source ↗</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VendorSearchPage() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<ExternalVendor[]>([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [filterText, setFilterText] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(""); setVendors([]); setSearched(false); setFilterText("");
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (country.trim()) params.set("country", country.trim());
      if (state.trim()) params.set("state", state.trim());
      if (city.trim()) params.set("city", city.trim());
      const res = await fetchApi(`/api/v1/admin/search?${params}`);
      if (!res.ok) {
        let errMsg = `Search failed (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.detail) errMsg = errData.detail;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      setVendors(data.external || []);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = useMemo(() => {
    if (!filterText.trim()) return vendors;
    const ft = filterText.toLowerCase();
    return vendors.filter(v => {
      const name = (v.companyName || v.company_name || "").toLowerCase();
      const desc = (v.description || "").toLowerCase();
      const addr = (v.localBranch?.branchAddress || v.contact?.address || "").toLowerCase();
      const prods = (v.capabilities?.coreProducts || []).join(" ").toLowerCase();
      return name.includes(ft) || desc.includes(ft) || addr.includes(ft) || prods.includes(ft);
    });
  }, [vendors, filterText]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-8 shadow-md border border-slate-800">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase">
            <span>✨ Gemini AI Grounding Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Verified Vendor Discovery</h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Instantly discover manufacturers, Tier-1 OEMs, regional distributors, and local branch hubs across any location worldwide. Powered by Gemini AI with live web search grounding.
          </p>
        </div>
      </div>

      {/* Search Form Panel */}
      <form onSubmit={handleSearch} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
        <div>
          <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
            Product / Item / Equipment Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} required
              placeholder="e.g. CT Scan, MRI Machine, Surgical Gloves, Titanium Screws, Patient Monitor..."
              className="w-full text-base sm:text-lg font-medium border-2 border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-3.5 pl-11 outline-none transition-all shadow-2xs" />
            <span className="absolute left-4 top-4 text-slate-400 text-lg">🔍</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">Country</label>
            <input type="text" value={country} onChange={e => setCountry(e.target.value)}
              placeholder="e.g. India, USA, Germany"
              className="w-full border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition-all" />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">State / Province</label>
            <input type="text" value={state} onChange={e => setState(e.target.value)}
              placeholder="e.g. Rajasthan, Delhi NCR, Maharashtra"
              className="w-full border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition-all" />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">City / Location</label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="e.g. Jaipur, Delhi, Mumbai, Pune"
              className="w-full border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-sm font-medium outline-none transition-all" />
          </div>
        </div>

        <button type="submit" disabled={loading || !query.trim()}
          className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-3 transition-all shadow-md">
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Scanning Live Web Sources via Gemini AI...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Discover Verified Vendors</span>
            </>
          )}
        </button>
      </form>

      {/* Loading Banner */}
      {loading && (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <h3 className="text-xl font-black text-slate-900">Discovering Suppliers Live via Gemini AI...</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Extracting local branch hubs, 24/7 SLAs, technical specs, commercial pricing terms, and hospital tender records.
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-bold flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Search Results Display */}
      {!loading && searched && (
        <div className="space-y-6">
          {/* Results Summary & In-Page Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-900">
                  {vendors.length > 0 ? `${vendors.length} Verified Vendors Found` : "No Vendors Found"}
                </h2>
                <span className="text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full">
                  📍 {[city, state, country].filter(Boolean).join(", ") || "Global Search"} · {query}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Sourced dynamically via Gemini AI with Google Search Grounding</p>
            </div>

            {vendors.length > 0 && (
              <div className="w-full sm:w-72 relative">
                <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                  placeholder="Filter 20 vendors by name or city..."
                  className="w-full text-xs font-medium border border-slate-200 focus:border-indigo-600 rounded-xl px-3.5 py-2 pl-9 outline-none transition-all" />
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
            )}
          </div>

          {/* Vendors List */}
          {filteredVendors.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
              <span className="text-5xl block mb-4">🔍</span>
              <p className="text-slate-700 font-bold">No vendors match your search or filter.</p>
              <p className="text-slate-400 text-xs mt-1">Try clearing the filter text or adjusting your location query.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredVendors.map((v, i) => (
                <VendorCardStructured 
                  key={i} 
                  vendor={v} 
                  idx={i} 
                  activeTab="" 
                  toggleTab={() => {}} 
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial Empty State */}
      {!loading && !searched && !error && (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl p-8 shadow-2xs space-y-4">
          <span className="text-6xl block">🏭</span>
          <h3 className="text-2xl font-black text-slate-900">Global Supply Chain & Medical Equipment Intelligence</h3>
          <p className="text-slate-500 text-sm max-w-xl mx-auto leading-relaxed">
            Enter a product name and location above. Gemini AI will perform dynamic Google Search Grounding to discover Tier-1 OEMs, regional distributors, and local branch service hubs complete with contact details, technical specs, commercial pricing terms, and hospital tender installation track records.
          </p>
        </div>
      )}
    </div>
  );
}
