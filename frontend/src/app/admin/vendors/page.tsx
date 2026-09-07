"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api/client";

export default function AdminVendorsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  
  // Selection & Details
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [vendorDocs, setVendorDocs] = useState<any[]>([]);
  const [vendorQs, setVendorQs] = useState<any[]>([]);
  const [vendorCats, setVendorCats] = useState<any[]>([]);
  
  // New States for Tabbed Interface and PDF Viewer
  const [activeTab, setActiveTab] = useState<"profile" | "financials" | "projects" | "documents" | "declarations">("profile");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Products associated with a catalog ID
  const [catalogProducts, setCatalogProducts] = useState<Record<string, any[]>>({});
  
  // Verification action
  const [verifying, setVerifying] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Auth/Role Check
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    // 1. First ensure user is logged in
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          router.push("/login?callbackUrl=/admin/vendors");
          return;
        }

        const res = await fetchApi("/api/v1/auth/me");
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          setIsAuthenticated(true);
          
          if (userData.roles && (userData.roles.includes("ADMIN") || userData.roles.includes("SYSTEM_ADMIN"))) {
            // Further granular permission checks could happen here if we used scopes.
            setIsAuthorized(true);
            loadVendors();
          } else {
            setIsAuthorized(false);
          }
        } else {
          router.push("/login?callbackUrl=/admin/vendors");
        }
      } catch (err) {
        console.error("Auth check error", err);
        router.push("/login");
      } finally {
        setAuthChecking(false);
      }
    };
    checkAuth();
  }, [router]);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const res = await fetchApi("/api/v1/admin/vendors");
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
      } else if (res.status === 403) {
        setIsAuthorized(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedVendorId) {
      loadVendorDetails(selectedVendorId);
    }
  }, [selectedVendorId]);

  const loadVendorDetails = async (id: string) => {
    try {
      setLoadingDetails(true);
      const [vRes, dRes, qRes, cRes] = await Promise.all([
        fetchApi(`/api/v1/admin/vendors/${id}`),
        fetchApi(`/api/v1/admin/vendors/${id}/documents`),
        fetchApi(`/api/v1/admin/vendors/${id}/questionnaires`),
        fetchApi(`/api/v1/admin/vendors/${id}/catalogs`)
      ]);
      
      if (!vRes.ok) throw new Error("Failed to load vendor details");
      
      const vData = await vRes.json();
      setSelectedVendor(vData);
      
      if (dRes.ok) setVendorDocs(await dRes.json());
      if (qRes.ok) setVendorQs(await qRes.json());
      if (cRes.ok) {
          const cData = await cRes.json();
          setVendorCats(cData);
          // Fetch products for each catalog
          cData.forEach((cat: any) => fetchCatalogProducts(id, cat.id));
      }
      
      // Reset active tab to profile when changing vendors
      setActiveTab("profile");
      setPdfUrl(null);
      
    } catch (e) {
      console.error(e);
      alert("Error loading vendor details");
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const fetchCatalogProducts = async (vendorId: string, catalogId: string) => {
      try {
          const res = await fetchApi(`/api/v1/admin/vendors/${vendorId}/catalogs/${catalogId}/products`);
          if (res.ok) {
              const products = await res.json();
              setCatalogProducts(prev => ({ ...prev, [catalogId]: products }));
          }
      } catch (err) {
          console.error("Failed to fetch catalog products", err);
      }
  }

  const handleVerify = async (action: "approve" | "reject") => {
    if (!selectedVendor) return;
    try {
      setVerifying(true);
      // Construct action-specific payload based on the endpoint requirements.
      // E.g., maybe we just send state transition explicitly.
      let newStatus = action === "approve" ? "APPROVED" : "REJECTED";
      let newVerification = action === "approve" ? "VERIFIED" : "UNVERIFIED";

      // Actually, admin verification might have its own dedicated endpoint or we use PATCH
      const res = await fetchApi(`/api/v1/admin/vendors/${selectedVendor.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          action: action,
          comments: action === "reject" ? "Rejected by Admin" : "Approved by Admin"
        })
      });

      if (res.ok) {
        alert(`Vendor ${action}d successfully`);
        // Refresh detail
        loadVendorDetails(selectedVendor.id);
        loadVendors();
      } else {
        alert(`Failed to ${action} vendor`);
      }
    } catch (e) {
      console.error(e);
      alert("Error verifying vendor");
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteVendor = async (vendorId: string, vendorName: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete vendor "${vendorName}" and all associated documents and catalog records? This action CANNOT be undone.`)) {
      return;
    }
    try {
      setVerifying(true);
      const res = await fetchApi(`/api/v1/admin/vendors/${vendorId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        alert(`Vendor "${vendorName}" deleted successfully.`);
        if (selectedVendorId === vendorId) {
          setSelectedVendorId(null);
          setSelectedVendor(null);
        }
        loadVendors();
      } else {
        alert("Failed to delete vendor.");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting vendor.");
    } finally {
      setVerifying(false);
    }
  };

  const filteredVendors = vendors.filter(v => 
    filterStatus === "ALL" ? true : v.status === filterStatus
  );

  const selectVendorForInspection = (id: string) => {
    setSelectedVendorId(id);
  };
  
  const handleViewPdf = async (vendorId: string, documentId: string) => {
    try {
      const res = await fetchApi(`/api/v1/admin/vendors/${vendorId}/documents/${documentId}/download`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        alert("Failed to load document");
      }
    } catch (e) {
      console.error(e);
      alert("Error loading document");
    }
  };

  const closePdfViewer = () => {
      if (pdfUrl) {
          window.URL.revokeObjectURL(pdfUrl);
          setPdfUrl(null);
      }
  };

  // ── Authentication Checks ───────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          Authenticating...
        </div>
      </div>
    );
  }

  // ── Authenticated but insufficient permissions ───────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-center border border-red-100">
          <div className="text-4xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500 mb-2">
            Your account does not have permission to access the vendor management portal.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Required permission: <code className="bg-gray-100 px-1 rounded">vendors.approve</code> or{" "}
            <code className="bg-gray-100 px-1 rounded">vendors.read_all</code>
          </p>
        </div>
      </div>
    );
  }

  // ── Authorized admin view ───────────────────────────────────────────────────
  return (
    <div className="text-gray-900 min-h-screen">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Vendor Management</h1>

        {selectedVendorId && loadingDetails ? (
          <div className="bg-white shadow rounded-lg p-12 text-center text-gray-500">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            Loading vendor profile...
          </div>
        ) : selectedVendorId && selectedVendor ? (
          /* Detailed Inspection View */
          <div className="space-y-6 animate-fade-in-up">
            
            {/* Header & Status Card */}
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
              <div className="px-6 py-5 flex justify-between items-start bg-gray-50 border-b border-gray-100">
                <div>
                  <button 
                    onClick={() => { setSelectedVendorId(null); setSelectedVendor(null); closePdfViewer(); }}
                    className="text-sm text-gray-500 hover:text-gray-800 mb-3 flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    Back to Vendor List
                  </button>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedVendor.legal_name}</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    {selectedVendor.trade_name || selectedVendor.legal_name} • {selectedVendor.organization_type} • {selectedVendor.country}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedVendor.status === "APPROVED" ? "bg-green-100 text-green-800 border border-green-200" :
                        selectedVendor.status === "REJECTED" ? "bg-red-100 text-red-800 border border-red-200" :
                        "bg-yellow-100 text-yellow-800 border border-yellow-200"
                      }`}>
                        Status: {selectedVendor.status}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedVendor.verification_status === "VERIFIED" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                        "bg-gray-100 text-gray-800 border border-gray-200"
                      }`}>
                        {selectedVendor.verification_status}
                      </span>
                  </div>
                  
                  {/* Admin Actions */}
                  <div className="flex space-x-2 mt-2">
                      {selectedVendor.status !== "APPROVED" && (
                        <>
                          <button
                            onClick={() => handleVerify("reject")}
                            disabled={verifying}
                            className="px-4 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 rounded-lg text-sm font-semibold border border-yellow-200 transition-colors shadow-sm"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleVerify("approve")}
                            disabled={verifying}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                          >
                            Approve Vendor
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteVendor(selectedVendor.id, selectedVendor.legal_name)}
                        disabled={verifying}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                      >
                        Delete Vendor
                      </button>
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="px-6 flex gap-6 border-b border-gray-200 bg-white pt-2 overflow-x-auto">
                  {[
                      { id: "profile", label: "Profile & Contacts" },
                      { id: "financials", label: "Financials & Bank" },
                      { id: "projects", label: "Project History" },
                      { id: "declarations", label: "Classification & Pre-Qual" },
                      { id: "documents", label: "Documents & Catalogs" }
                  ].map(tab => (
                      <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`pb-4 pt-2 text-sm font-semibold transition-all border-b-2 ${
                              activeTab === tab.id 
                              ? "border-blue-600 text-blue-600" 
                              : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                          }`}
                      >
                          {tab.label}
                      </button>
                  ))}
              </div>
              
              {/* Tab Content Container */}
              <div className="p-6 bg-gray-50">
                  
                  {/* TAB 1: Profile */}
                  {activeTab === "profile" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Business Information</h3>
                              <div className="space-y-3 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">Vendor Code:</span> <span className="font-bold text-gray-900 font-mono">{selectedVendor.vendor_code || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Legal Name:</span> <span className="font-medium text-gray-900">{selectedVendor.legal_name || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Display Name:</span> <span className="font-medium text-gray-900">{selectedVendor.display_name || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Short Name:</span> <span className="font-medium text-gray-900">{selectedVendor.short_name || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Vendor Group:</span> <span className="font-medium text-gray-900">{selectedVendor.vendor_group || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Vendor Type:</span> <span className="font-medium text-gray-900">{selectedVendor.vendor_type || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Vendor Category:</span> <span className="font-medium text-gray-900">{selectedVendor.vendor_category || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Registration (PAN):</span> <span className="font-medium text-gray-900 font-mono">{selectedVendor.pan_number || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Tax ID (GSTIN):</span> <span className="font-medium text-gray-900 font-mono">{selectedVendor.gstin || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">GST Reg. Type:</span> <span className="font-medium text-gray-900">{selectedVendor.gst_registration_type || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">MSME Registered:</span> <span className="font-semibold text-gray-900">{selectedVendor.msme_registered ? "Yes" : "No"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">TDS Applicable:</span> <span className="font-semibold text-gray-900">{selectedVendor.tds_applicable ? "Yes" : "No"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Address:</span> <span className="font-medium text-gray-900 text-right">{[selectedVendor.address_line_1, selectedVendor.address_line_2, selectedVendor.city, selectedVendor.state_province, selectedVendor.postal_code, selectedVendor.country].filter(Boolean).join(', ') || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Website:</span> <span className="font-medium text-blue-600">{selectedVendor.website || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Primary Contact:</span> <span className="font-medium text-gray-900">{selectedVendor.primary_contact_person || selectedVendor.primary_email || "N/A"} ({selectedVendor.contact_designation || "N/A"})</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Primary Phone:</span> <span className="font-medium text-gray-900">{selectedVendor.primary_phone || "N/A"}</span></div>
                                  {selectedVendor.head_name && (
                                    <div className="mt-3 pt-3 border-t">
                                      <span className="text-xs text-gray-400 font-bold uppercase block mb-1">Head of Organisation</span>
                                      <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-bold text-gray-900">{selectedVendor.head_name}</span></div>
                                      <div className="flex justify-between"><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{selectedVendor.head_designation || "Managing Director"}</span></div>
                                      <div className="flex justify-between"><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{selectedVendor.head_email || "N/A"}</span></div>
                                      <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{selectedVendor.head_phone || "N/A"}</span></div>
                                    </div>
                                  )}
                              </div>
                          </div>
                          
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Contacts & Executive Team</h3>
                              {selectedVendor.contacts && selectedVendor.contacts.length > 0 ? (
                                  <div className="space-y-6">
                                      {selectedVendor.contacts.map((contact: any, index: number) => (
                                          <div key={index} className="text-sm border-b pb-3 last:border-0">
                                              <h4 className="font-semibold text-blue-700 mb-2 uppercase text-xs tracking-wider">
                                                  {contact.contact_type || (index === 0 ? "Primary Contact" : `Contact ${index + 1}`)}
                                              </h4>
                                              <div className="space-y-2">
                                                  <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-bold text-gray-900">{contact.full_name}</span></div>
                                                  <div className="flex justify-between"><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{contact.designation || "N/A"}</span></div>
                                                  <div className="flex justify-between"><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{contact.email}</span></div>
                                                  <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{contact.phone}</span></div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              ) : (
                                  <div className="space-y-4 text-sm">
                                      {/* Fallback Primary Contact */}
                                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                                          <span className="text-xs text-blue-700 font-bold uppercase tracking-wider block">Primary Contact Person</span>
                                          <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-bold text-gray-900">{selectedVendor.primary_contact_person || selectedVendor.legal_name || "N/A"}</span></div>
                                          <div className="flex justify-between"><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{selectedVendor.contact_designation || "Primary Contact"}</span></div>
                                          <div className="flex justify-between"><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{selectedVendor.primary_email || "N/A"}</span></div>
                                          <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{selectedVendor.primary_phone || "N/A"}</span></div>
                                      </div>

                                      {/* Fallback Head of Organisation */}
                                      {selectedVendor.head_name && (
                                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                                              <span className="text-xs text-blue-700 font-bold uppercase tracking-wider block">Head of Organisation</span>
                                              <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-bold text-gray-900">{selectedVendor.head_name}</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{selectedVendor.head_designation || "Managing Director"}</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{selectedVendor.head_email || "N/A"}</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{selectedVendor.head_phone || "N/A"}</span></div>
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  {/* TAB 2: Financials & Bank */}
                  {activeTab === "financials" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Annual Turnover (INR Crores)</h3>
                              {selectedVendor.financials && selectedVendor.financials.length > 0 ? (
                                  <div className="space-y-4">
                                      <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center border border-blue-100">
                                          <span className="font-semibold text-blue-800">FY 2023-24</span>
                                          <span className="font-bold text-lg text-blue-900">
                                            {selectedVendor.financials[0].turnover_fy1 != null ? `₹${selectedVendor.financials[0].turnover_fy1} Cr` : "N/A"}
                                          </span>
                                      </div>
                                      <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center border border-blue-100">
                                          <span className="font-semibold text-blue-800">FY 2024-25</span>
                                          <span className="font-bold text-lg text-blue-900">
                                            {selectedVendor.financials[0].turnover_fy2 != null ? `₹${selectedVendor.financials[0].turnover_fy2} Cr` : "N/A"}
                                          </span>
                                      </div>
                                      <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center border border-blue-100">
                                          <span className="font-semibold text-blue-800">FY 2025-26</span>
                                          <span className="font-bold text-lg text-blue-900">
                                            {selectedVendor.financials[0].turnover_fy3 != null ? `₹${selectedVendor.financials[0].turnover_fy3} Cr` : "N/A"}
                                          </span>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                      <p>No financial records uploaded.</p>
                                  </div>
                              )}
                          </div>

                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Primary Bank Account</h3>
                              {selectedVendor.bank_details && selectedVendor.bank_details.length > 0 ? (
                                  <div className="space-y-4 text-sm">
                                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                          <div className="mb-2"><span className="text-gray-500 uppercase text-xs font-bold tracking-wider">Bank Name</span><p className="font-bold text-lg text-gray-900">{selectedVendor.bank_details[0].bank_name}</p></div>
                                          <div className="grid grid-cols-2 gap-4 mt-4">
                                              <div><span className="text-gray-500 uppercase text-xs font-bold tracking-wider">A/C Holder</span><p className="font-medium text-gray-900">{selectedVendor.bank_details[0].account_name}</p></div>
                                              <div><span className="text-gray-500 uppercase text-xs font-bold tracking-wider">IFSC Code</span><p className="font-medium text-gray-900">{selectedVendor.bank_details[0].ifsc_code}</p></div>
                                              <div className="col-span-2"><span className="text-gray-500 uppercase text-xs font-bold tracking-wider">Account Number</span><p className="font-mono bg-gray-200 p-2 rounded mt-1 text-gray-800 font-bold">{selectedVendor.bank_details[0].account_number}</p></div>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                      <p>No bank details provided.</p>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  {/* TAB 3: Projects */}
                  {activeTab === "projects" && (
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                          <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Past Hospital Projects</h3>
                          {selectedVendor.projects && selectedVendor.projects.length > 0 ? (
                              <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                                      <thead>
                                          <tr className="bg-gray-50 text-gray-500">
                                              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Hospital Name</th>
                                              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Year</th>
                                              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Project Cost (INR Cr)</th>
                                              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Duration</th>
                                              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs">300+ Beds?</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {selectedVendor.projects.map((p: any) => (
                                              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="px-4 py-3 font-medium text-gray-900">{p.hospital_name}</td>
                                                  <td className="px-4 py-3 text-gray-600">{p.financial_year || "-"}</td>
                                                  <td className="px-4 py-3 text-gray-900 font-mono font-bold">
                                                    {p.project_cost != null ? `₹${p.project_cost} Cr` : "-"}
                                                  </td>
                                                  <td className="px-4 py-3 text-gray-600">{p.project_duration || "-"}</td>
                                                  <td className="px-4 py-3 text-center">
                                                      {p.is_300_plus_beds ? 
                                                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-bold text-xs">YES</span> : 
                                                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded font-bold text-xs">NO</span>
                                                      }
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          ) : (
                              <div className="text-center p-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                  <p>No past projects registered.</p>
                              </div>
                          )}
                      </div>
                  )}

                                    {/* TAB 5: Classification & Pre-Qual */}
                  {activeTab === "declarations" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Business Classification</h3>
                              <div className="space-y-3 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">Primary Supply Category:</span> <span className="font-medium text-gray-900">{selectedVendor.supply_category || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Primary Biz Type:</span> <span className="font-medium text-gray-900">{selectedVendor.primary_business_type || "N/A"}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Geo Coverage:</span> <span className="font-medium text-gray-900">{selectedVendor.geographical_coverage || "N/A"}</span></div>
                                  <div className="mt-4 pt-4 border-t">
                                      <span className="text-gray-500 block mb-2">Registered Supply Categories:</span>
                                      <div className="flex flex-wrap gap-2">
                                          {selectedVendor.supply_categories_list ? 
                                              (typeof selectedVendor.supply_categories_list === 'string' ? JSON.parse(selectedVendor.supply_categories_list) : selectedVendor.supply_categories_list).map((cat: string, i: number) => (
                                                  <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded text-xs font-semibold">{cat}</span>
                                              ))
                                          : <span className="text-gray-400 italic">None registered</span>}
                                      </div>
                                  </div>
                              </div>
                          </div>
                          
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                              <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Pre-Qualification & Declarations</h3>
                              <div className="space-y-4">
                                  <div className="flex justify-between border-b pb-2"><span className="text-gray-600 font-medium">Years in Business:</span> <span className="font-bold text-gray-900">{selectedVendor.years_in_business || "N/A"}</span></div>
                                  
                                  <div className="space-y-2 pt-2">
                                      <div className={`p-3 rounded-lg border ${selectedVendor.has_service_base_jaipur ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                          <div className="flex items-center space-x-2">
                                              <span className={selectedVendor.has_service_base_jaipur ? "text-green-600" : "text-gray-400"}>{selectedVendor.has_service_base_jaipur ? '✓' : '—'}</span>
                                              <span className="text-sm font-medium">Local Service Base in Jaipur</span>
                                          </div>
                                      </div>
                                      
                                      <div className={`p-3 rounded-lg border ${selectedVendor.not_debarred_declaration ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                          <div className="flex items-center space-x-2">
                                              <span className={selectedVendor.not_debarred_declaration ? "text-green-600" : "text-red-600"}>{selectedVendor.not_debarred_declaration ? '✓' : '⚠'}</span>
                                              <span className="text-sm font-medium">Not Debarred/Blacklisted Declaration</span>
                                          </div>
                                      </div>
                                      
                                      <div className={`p-3 rounded-lg border ${selectedVendor.pending_litigation || selectedVendor.is_blacklisted ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                          <div className="flex items-center space-x-2">
                                              <span className={selectedVendor.pending_litigation || selectedVendor.is_blacklisted ? "text-red-600" : "text-green-600"}>{selectedVendor.pending_litigation || selectedVendor.is_blacklisted ? '⚠' : '✓'}</span>
                                              <span className="text-sm font-medium">{selectedVendor.pending_litigation || selectedVendor.is_blacklisted ? 'Has Pending Litigation / Blacklisted' : 'No Pending Litigation'}</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* TAB 4: Documents & Catalogs */}
                  {activeTab === "documents" && (
                      <div className="space-y-6">

                          {/* Compliance Documents */}
                          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                              <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center justify-between">
                                  <span>Compliance Documents</span>
                                  <span className="bg-blue-100 text-blue-800 text-xs py-0.5 px-2 rounded-full">{vendorDocs.length} files</span>
                              </h3>
                              {vendorDocs.length === 0 ? (
                                  <p className="text-sm text-gray-500 italic text-center py-4">No documents uploaded.</p>
                              ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {vendorDocs.map((d) => (
                                          <div key={d.id} className="p-4 bg-gray-50 hover:bg-blue-50 transition-colors rounded-lg border border-gray-200 flex justify-between items-center group">
                                              <div className="overflow-hidden">
                                                  <span className="font-bold text-gray-800 block text-sm">{d.document_type}</span>
                                                  <span className="text-gray-500 text-xs truncate max-w-[180px] block">{d.latest_version?.original_filename || "No file"}</span>
                                              </div>
                                              {d.latest_version && (
                                                  <button
                                                      onClick={() => handleViewPdf(selectedVendor.id, d.id)}
                                                      className="text-blue-600 font-semibold bg-white border border-blue-200 shadow-sm px-3 py-1.5 rounded-md hover:bg-blue-600 hover:text-white transition-all text-xs flex-shrink-0 ml-2"
                                                  >
                                                      View PDF
                                                  </button>
                                              )}
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>

                          {/* Product Catalogs — full width, one per catalog */}
                          <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                              <div className="px-6 py-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                                  <h3 className="font-bold text-purple-900 text-lg flex items-center gap-2">
                                      📦 AI-Extracted Product Catalogs
                                  </h3>
                                  <span className="bg-purple-200 text-purple-800 text-xs font-bold py-1 px-3 rounded-full">
                                      {vendorCats.length} catalog{vendorCats.length !== 1 ? "s" : ""} · {Object.values(catalogProducts).flat().length} products
                                  </span>
                              </div>

                              {vendorCats.length === 0 ? (
                                  <div className="p-12 text-center text-gray-400">
                                      <div className="text-4xl mb-3">📂</div>
                                      <p className="font-medium">No catalogs uploaded yet.</p>
                                  </div>
                              ) : (
                                  <div className="divide-y divide-gray-100">
                                      {vendorCats.map((c) => {
                                          const products = catalogProducts[c.id];
                                          return (
                                              <div key={c.id} className="p-6">
                                                  {/* Catalog header */}
                                                  <div className="flex items-start justify-between mb-4">
                                                      <div>
                                                          <h4 className="font-bold text-gray-900 text-base">{c.title}</h4>
                                                          <p className="text-sm text-gray-500 mt-0.5">
                                                              {c.description || "No description"}
                                                              {c.catalog_year ? ` · Year: ${c.catalog_year}` : ""}
                                                          </p>
                                                      </div>
                                                      <div className="flex items-center gap-2 shrink-0 ml-4">
                                                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                                              c.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                                                          }`}>{c.status}</span>
                                                          <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-full">
                                                              {products ? `${products.length} products` : "loading..."}
                                                          </span>
                                                      </div>
                                                  </div>

                                                  {/* Products table */}
                                                  {products === undefined ? (
                                                      <div className="text-center py-6 text-gray-400 animate-pulse text-sm">Loading products...</div>
                                                  ) : products.length === 0 ? (
                                                      <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">No products extracted yet.</div>
                                                  ) : (
                                                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                                                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                              <thead className="bg-gray-50">
                                                                  <tr>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-8">#</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product Name</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">SKU</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Unit</th>
                                                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                                                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                                                  </tr>
                                                              </thead>
                                                              <tbody className="bg-white divide-y divide-gray-100">
                                                                  {products.map((p: any, idx: number) => {
                                                                      let attrs: Record<string, any> = {};
                                                                      try { attrs = JSON.parse(p.attributes_json || "{}"); } catch {}
                                                                      return (
                                                                          <tr key={p.id} className="hover:bg-purple-50 transition-colors">
                                                                              <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                                                              <td className="px-4 py-3">
                                                                                  <span className="font-semibold text-gray-900">{p.product_name || "—"}</span>
                                                                              </td>
                                                                              <td className="px-4 py-3 text-gray-600">
                                                                                  <p className="text-xs whitespace-pre-wrap">{p.description || "—"}</p>
                                                                                  {attrs.specifications && (
                                                                                      <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{attrs.specifications}</p>
                                                                                  )}
                                                                              </td>
                                                                              <td className="px-4 py-3">
                                                                                  {attrs.category ? (
                                                                                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{attrs.category}</span>
                                                                                  ) : <span className="text-gray-400">—</span>}
                                                                              </td>
                                                                              <td className="px-4 py-3 font-mono text-xs text-gray-700">{attrs.sku || "—"}</td>
                                                                              <td className="px-4 py-3 text-xs text-gray-600">{attrs.unit || "—"}</td>
                                                                              <td className="px-4 py-3 text-xs text-gray-700">
                                                                                  {attrs.price != null ? `${attrs.currency || "INR"} ${attrs.price}` : "—"}
                                                                              </td>
                                                                              <td className="px-4 py-3 text-center">
                                                                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                                                      p.status === "APPROVED" ? "bg-green-100 text-green-700" :
                                                                                      p.status === "NEEDS_REVIEW" ? "bg-yellow-100 text-yellow-700" :
                                                                                      "bg-red-100 text-red-700"
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
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

              </div>
            </div>

            {/* Inline PDF Viewer Modal Overlay */}
            {pdfUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-75 backdrop-blur-sm p-4 sm:p-8 animate-fade-in">
                    <div className="bg-white w-full max-w-6xl h-full rounded-xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
                                Document Viewer
                            </h3>
                            <button 
                                onClick={closePdfViewer}
                                className="text-gray-400 hover:text-red-500 bg-white hover:bg-red-50 p-2 rounded-full transition-colors focus:outline-none"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="flex-1 bg-gray-100">
                            <iframe 
                                src={pdfUrl} 
                                className="w-full h-full border-0"
                                title="PDF Document Viewer"
                            >
                                <p className="text-center p-8 text-gray-500">Your browser does not support inline PDFs. Please download the file to view it.</p>
                            </iframe>
                        </div>
                    </div>
                </div>
            )}
            
          </div>
        ) : (
          /* Vendor List Table */
          <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100 animate-fade-in-up">
            <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                Registered Vendors 
                <span className="ml-3 bg-blue-100 text-blue-800 text-xs py-0.5 px-2.5 rounded-full font-bold">{filteredVendors.length}</span>
              </h2>
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <span className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Status Filter:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 py-2 pl-3 pr-8 shadow-sm font-medium"
                >
                  <option value="ALL">All Vendors</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-16 text-center text-gray-500 flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                Loading vendors dashboard...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="p-16 text-center text-gray-500">
                <div className="text-5xl mb-4 opacity-50">🏢</div>
                <p className="text-lg font-medium">No vendors found in this status.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Company Legal Name</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type / Location</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredVendors.map((v) => (
                      <tr key={v.id} className="hover:bg-blue-50 transition-colors group cursor-pointer" onClick={() => selectVendorForInspection(v.id)}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">{v.legal_name}</div>
                          <div className="text-xs text-gray-500 mt-1">PAN: {v.pan_number || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{v.organization_type || "N/A"}</div>
                          <div className="text-xs text-gray-500 mt-1">{v.city ? `${v.city}, ` : ''}{v.country || "N/A"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
                            v.status === "APPROVED" ? "bg-green-100 text-green-800" :
                            v.status === "REJECTED" ? "bg-red-100 text-red-800" :
                            v.status === "SUBMITTED" || v.status === "UNDER_REVIEW" ? "bg-blue-100 text-blue-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {v.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); selectVendorForInspection(v.id); }}
                              className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1.5 rounded-lg font-bold group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm text-xs"
                            >
                              Inspect Profile →
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v.id, v.legal_name); }}
                              disabled={verifying}
                              className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
