"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

interface CatalogItem {
  id: string;
  title: string;
  description?: string;
  catalog_year?: string;
  document_version_id: string;
  status: string;
  created_at: string;
}

export default function MinimalWhiteVendorCatalogsPage() {
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Record<string, any[]>>({});
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { logout } = useAuth();

  // Form inputs
  const [title, setTitle] = useState("");
  const [catalogYear, setCatalogYear] = useState(new Date().getFullYear().toString());
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const profRes = await fetchApi("/api/v1/vendor/me");
      if (profRes.ok) {
        const prof = await profRes.json();
        setProfile(prof);
        if (prof.status !== "APPROVED") {
          router.push("/vendor/profile");
          return;
        }
      }
      const res = await fetchApi("/api/v1/vendor/catalogs");
      if (res.ok) {
        const catData: CatalogItem[] = await res.json();
        setCatalogs(catData);

        const prodsMap: Record<string, any[]> = {};
        for (const cat of catData) {
          try {
            const pRes = await fetchApi(`/api/v1/vendor/catalogs/${cat.id}/drafts`);
            if (pRes.ok) {
              prodsMap[cat.id] = await pRes.json();
            }
          } catch {}
        }
        setCatalogProducts(prodsMap);
      }
    } catch (err) {
      setMsg({ type: "error", text: "Failed to load catalog data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUploadAndExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMsg({ type: "error", text: "Please select a PDF catalog file to upload." });
      return;
    }
    if (!title) {
      setMsg({ type: "error", text: "Please enter a catalog title." });
      return;
    }

    setUploading(true);
    setMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const docRes = await fetchApi("/api/v1/vendor/documents?document_type=PRODUCT_CATALOG", {
        method: "POST",
        body: formData,
        headers: {}
      });

      if (!docRes.ok) {
        throw new Error("Failed to upload catalog PDF document.");
      }

      const docData = await docRes.json();
      const documentVersionId = docData.latest_version?.id || docData.version_id;

      if (!documentVersionId) {
        throw new Error("Could not retrieve document version ID.");
      }

      const catRes = await fetchApi("/api/v1/vendor/catalogs", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          catalog_year: catalogYear,
          document_version_id: documentVersionId,
        }),
      });

      if (!catRes.ok) {
        throw new Error("Failed to register catalog.");
      }

      const catalogData = await catRes.json();

      await fetchApi(`/api/v1/vendor/catalogs/${catalogData.id}/extract`, { method: "POST" });

      setMsg({
        type: "success",
        text: "Catalog PDF uploaded! Gemini AI is now extracting products into the database."
      });

      setTitle("");
      setDescription("");
      setFile(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "An error occurred during catalog processing." });
    } finally {
      setUploading(false);
    }
  };

  const triggerManualExtract = async (catalogId: string) => {
    try {
      setMsg(null);
      const res = await fetchApi(`/api/v1/vendor/catalogs/${catalogId}/extract`, { method: "POST" });
      if (res.ok) {
        setMsg({ type: "success", text: "AI Extraction job queued!" });
        loadData();
      }
    } catch (err) {
      setMsg({ type: "error", text: "Failed to queue extraction." });
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
                    <Link href="/vendor/search" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      BOQ Submissions
                    </Link>
                    <Link href="/vendor/recommendations" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      My Proposals
                    </Link>
                    <Link href="/vendor/documents" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                      Documents
                    </Link>
                    <Link href="/vendor/catalogs" className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
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
        
        {/* Title Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <span>📦 AI Product Catalog Extraction</span>
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Upload product catalog PDFs. Gemini AI will automatically extract line items, specs, categories, and prices.
              </p>
            </div>
            <span className="bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full">
              Powered by Gemini AI
            </span>
          </div>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className={`p-4 rounded-xl text-sm flex items-center space-x-2 ${
            msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            <span>{msg.type === "success" ? "✓" : "⚠️"}</span>
            <span>{msg.text}</span>
          </div>
        )}

        {/* Catalog Upload Form Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
              <span>⬆</span>
              <span>Upload New Catalog PDF for AI Extraction</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Select your catalog file and specify title details</p>
          </div>

          <form onSubmit={handleUploadAndExtract} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Catalog Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Medical Equipment & Consumables 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Catalog Year</label>
                <input
                  type="text"
                  value={catalogYear}
                  onChange={(e) => setCatalogYear(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Overview of products included in this catalog..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Select Catalog PDF File *</label>
                <input
                  type="file"
                  required
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-700 text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <span>🤖</span>
              <span>{uploading ? "Uploading & Extracting..." : "Upload Catalog & Extract with AI"}</span>
            </button>
          </form>
        </div>

        {/* Catalogs & Extracted Products List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Registered Catalogs & Extracted Products</h2>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading catalog extractions...</div>
          ) : catalogs.length === 0 ? (
            <div className="bg-white border border-gray-200 p-8 rounded-xl text-center text-gray-500 shadow-sm">
              No catalogs uploaded yet. Use the upload box above to extract product data with AI.
            </div>
          ) : (
            catalogs.map((c) => {
              const products = catalogProducts[c.id] || [];
              return (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Catalog Header */}
                  <div className="p-5 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                        <span>📄</span>
                        <span>{c.title}</span>
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.description || "Product catalog"} {c.catalog_year ? `• Year: ${c.catalog_year}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        c.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}>
                        {c.status}
                      </span>

                      <button
                        onClick={() => triggerManualExtract(c.id)}
                        className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-300 transition-all flex items-center space-x-1 shadow-sm"
                      >
                        <span>🔄</span>
                        <span>Re-Run AI Extract</span>
                      </button>
                    </div>
                  </div>

                  {/* Extracted Products Table */}
                  <div className="p-5">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold uppercase text-gray-500">AI-Extracted Line Items ({products.length})</span>
                    </div>

                    {products.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        AI extraction job queued or no products detected yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
                            <tr>
                              <th className="px-4 py-3 text-left">#</th>
                              <th className="px-4 py-3 text-left">Product Name</th>
                              <th className="px-4 py-3 text-left">Description / Specs</th>
                              <th className="px-4 py-3 text-left">Category</th>
                              <th className="px-4 py-3 text-left">SKU</th>
                              <th className="px-4 py-3 text-left">Unit</th>
                              <th className="px-4 py-3 text-left">Price</th>
                              <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {products.map((p: any, idx: number) => {
                              let attrs: Record<string, any> = {};
                              try { attrs = JSON.parse(p.attributes_json || "{}"); } catch {}
                              return (
                                <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                                  <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                                  <td className="px-4 py-3 font-bold text-gray-900">{p.product_name || "—"}</td>
                                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.description || "—"}</td>
                                  <td className="px-4 py-3">
                                    {attrs.category ? (
                                      <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">{attrs.category}</span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-gray-600">{attrs.sku || "—"}</td>
                                  <td className="px-4 py-3 text-gray-600">{attrs.unit || "—"}</td>
                                  <td className="px-4 py-3 text-gray-900 font-semibold">
                                    {attrs.price != null ? `${attrs.currency || "INR"} ${attrs.price}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      p.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                                      p.status === "NEEDS_REVIEW" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                                    }`}>{p.status}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
