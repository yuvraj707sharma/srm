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
  
  // Tabbed Interface and PDF Viewer
  const [activeTab, setActiveTab] = useState<"profile" | "financials" | "projects" | "declarations" | "documents" | "evaluation">("evaluation");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Products associated with a catalog ID
  const [catalogProducts, setCatalogProducts] = useState<Record<string, any[]>>({});
  
  // Verification action
  const [verifying, setVerifying] = useState(false);

  // Filters & Sorting
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"default" | "score" | "turnover" | "projects">("score");

  // 5-Point Evaluation States
  const [evalHospitalsScore, setEvalHospitalsScore] = useState<number>(20);
  const [evalHospitalsMeets, setEvalHospitalsMeets] = useState<boolean>(true);
  const [evalHospitalsRemarks, setEvalHospitalsRemarks] = useState<string>("");

  const [evalTurnoverScore, setEvalTurnoverScore] = useState<number>(20);
  const [evalTurnoverMeets, setEvalTurnoverMeets] = useState<boolean>(true);
  const [evalTurnoverRemarks, setEvalTurnoverRemarks] = useState<string>("");

  const [evalHighValueScore, setEvalHighValueScore] = useState<number>(20);
  const [evalHighValueMeets, setEvalHighValueMeets] = useState<boolean>(true);
  const [evalHighValueRemarks, setEvalHighValueRemarks] = useState<string>("");

  const [evalServiceBaseScore, setEvalServiceBaseScore] = useState<number>(20);
  const [evalServiceBaseMeets, setEvalServiceBaseMeets] = useState<boolean>(true);
  const [evalServiceBaseRemarks, setEvalServiceBaseRemarks] = useState<string>("");

  const [evalBalanceSheetScore, setEvalBalanceSheetScore] = useState<number>(20);
  const [evalBalanceSheetVerified, setEvalBalanceSheetVerified] = useState<boolean>(true);
  const [evalBalanceSheetRemarks, setEvalBalanceSheetRemarks] = useState<string>("");

  const [evalGrade, setEvalGrade] = useState<string>("A_GRADE");
  const [evalRecommendation, setEvalRecommendation] = useState<string>("RECOMMENDED_BEST");
  const [evalEvaluatorName, setEvalEvaluatorName] = useState<string>("");
  const [evalSummaryNotes, setEvalSummaryNotes] = useState<string>("");
  const [savingEval, setSavingEval] = useState<boolean>(false);
  const [evalMsg, setEvalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      const [vRes, dRes, qRes, cRes, eRes] = await Promise.all([
        fetchApi(`/api/v1/admin/vendors/${id}`),
        fetchApi(`/api/v1/admin/vendors/${id}/documents`),
        fetchApi(`/api/v1/admin/vendors/${id}/questionnaires`),
        fetchApi(`/api/v1/admin/vendors/${id}/catalogs`),
        fetchApi(`/api/v1/admin/vendors/${id}/evaluation`)
      ]);
      
      if (!vRes.ok) throw new Error("Failed to load vendor details");
      
      const vData = await vRes.json();
      setSelectedVendor(vData);
      
      let docsData: any[] = [];
      if (dRes.ok) {
        docsData = await dRes.json();
        setVendorDocs(docsData);
      }
      if (qRes.ok) setVendorQs(await qRes.json());
      if (cRes.ok) {
          const cData = await cRes.json();
          setVendorCats(cData);
          // Fetch products for each catalog
          cData.forEach((cat: any) => fetchCatalogProducts(id, cat.id));
      }

      // Check evaluation
      let existingEval = null;
      if (eRes.ok) {
        const eData = await eRes.json();
        existingEval = eData.evaluation;
      }
      if (!existingEval && vData.evaluations && vData.evaluations.length > 0) {
        existingEval = vData.evaluations[0];
      }

      if (existingEval) {
        setEvalHospitalsScore(existingEval.hospitals_score ?? 20);
        setEvalHospitalsMeets(Boolean(existingEval.hospitals_meets));
        setEvalHospitalsRemarks(existingEval.hospitals_remarks || "");

        setEvalTurnoverScore(existingEval.turnover_score ?? 20);
        setEvalTurnoverMeets(Boolean(existingEval.turnover_meets));
        setEvalTurnoverRemarks(existingEval.turnover_remarks || "");

        setEvalHighValueScore(existingEval.high_value_projects_score ?? 20);
        setEvalHighValueMeets(Boolean(existingEval.high_value_projects_meets));
        setEvalHighValueRemarks(existingEval.high_value_projects_remarks || "");

        setEvalServiceBaseScore(existingEval.service_base_score ?? 20);
        setEvalServiceBaseMeets(Boolean(existingEval.service_base_meets));
        setEvalServiceBaseRemarks(existingEval.service_base_remarks || "");

        setEvalBalanceSheetScore(existingEval.balance_sheet_score ?? 20);
        setEvalBalanceSheetVerified(Boolean(existingEval.balance_sheet_verified));
        setEvalBalanceSheetRemarks(existingEval.balance_sheet_remarks || "");

        setEvalGrade(existingEval.evaluation_grade || "A_GRADE");
        setEvalRecommendation(existingEval.recommendation || "RECOMMENDED_BEST");
        setEvalEvaluatorName(existingEval.evaluator_name || user?.full_name || user?.username || "Admin");
        setEvalSummaryNotes(existingEval.admin_summary_notes || "");
      } else {
        // Smart defaults based on vendor submitted responses to the 5 email criteria
        const hasHospitalProjects = (vData.projects && vData.projects.filter((p: any) => p.is_300_plus_beds).length > 0) || ((vData.projects_completed_count || 0) > 0);
        setEvalHospitalsMeets(Boolean(hasHospitalProjects));
        setEvalHospitalsScore(hasHospitalProjects ? 20 : 10);
        setEvalHospitalsRemarks(hasHospitalProjects ? `${(vData.projects || []).length || vData.projects_completed_count} verified hospital projects (>300 beds).` : "Review project details.");

        const hasTurnover = Boolean(vData.financials && vData.financials[0]?.turnover_fy2);
        setEvalTurnoverMeets(hasTurnover);
        setEvalTurnoverScore(hasTurnover ? 20 : 10);
        setEvalTurnoverRemarks(hasTurnover ? `FY 2024-25 Turnover: ₹${vData.financials[0].turnover_fy2} Cr.` : "Review financials.");

        const hasHighVal = (vData.high_value_projects_count > 0) || ((vData.projects || []).some((p: any) => Number(p.project_cost) >= 1.0));
        setEvalHighValueMeets(Boolean(hasHighVal));
        setEvalHighValueScore(hasHighVal ? 20 : 10);
        setEvalHighValueRemarks(hasHighVal ? `${vData.high_value_projects_count || 'Multiple'} high-value projects confirmed.` : "Review project costs.");

        const hasJaipur = Boolean(vData.has_service_base_jaipur);
        setEvalServiceBaseMeets(hasJaipur);
        setEvalServiceBaseScore(hasJaipur ? 20 : 5);
        setEvalServiceBaseRemarks(hasJaipur ? "Local service presence in Jaipur/Rajasthan confirmed." : "No local service presence indicated.");

        const hasBalanceSheet = docsData.some((d: any) => d.document_type === "BALANCE_SHEET");
        setEvalBalanceSheetVerified(hasBalanceSheet);
        setEvalBalanceSheetScore(hasBalanceSheet ? 20 : 5);
        setEvalBalanceSheetRemarks(hasBalanceSheet ? "Audited Balance Sheet for FY 2024-25 verified." : "Audited balance sheet pending review.");

        setEvalGrade("A_GRADE");
        setEvalRecommendation("RECOMMENDED_BEST");
        setEvalEvaluatorName(user?.full_name || user?.username || "Admin Evaluator");
        setEvalSummaryNotes("");
      }
      setEvalMsg(null);
      
      // Default to evaluation tab when reviewing vendor
      setActiveTab("evaluation");
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

  const totalEvalScore = Math.min(100, Math.max(0, evalHospitalsScore + evalTurnoverScore + evalHighValueScore + evalServiceBaseScore + evalBalanceSheetScore));

  const handleSaveEvaluation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedVendor) return;
    try {
      setSavingEval(true);
      setEvalMsg(null);

      // Auto derive grade based on 100-point total
      let calculatedGrade = evalGrade;
      if (totalEvalScore >= 85) calculatedGrade = "A_GRADE";
      else if (totalEvalScore >= 70) calculatedGrade = "B_GRADE";
      else if (totalEvalScore >= 50) calculatedGrade = "C_GRADE";
      else calculatedGrade = "D_GRADE";

      const payload = {
        hospitals_score: Number(evalHospitalsScore),
        hospitals_meets: Boolean(evalHospitalsMeets),
        hospitals_remarks: evalHospitalsRemarks,
        turnover_score: Number(evalTurnoverScore),
        turnover_meets: Boolean(evalTurnoverMeets),
        turnover_remarks: evalTurnoverRemarks,
        high_value_projects_score: Number(evalHighValueScore),
        high_value_projects_meets: Boolean(evalHighValueMeets),
        high_value_projects_remarks: evalHighValueRemarks,
        service_base_score: Number(evalServiceBaseScore),
        service_base_meets: Boolean(evalServiceBaseMeets),
        service_base_remarks: evalServiceBaseRemarks,
        balance_sheet_score: Number(evalBalanceSheetScore),
        balance_sheet_verified: Boolean(evalBalanceSheetVerified),
        balance_sheet_remarks: evalBalanceSheetRemarks,
        total_score: totalEvalScore,
        evaluation_grade: calculatedGrade,
        recommendation: evalRecommendation,
        evaluator_name: evalEvaluatorName || user?.full_name || "Admin",
        admin_summary_notes: evalSummaryNotes
      };

      const res = await fetchApi(`/api/v1/admin/vendors/${selectedVendor.id}/evaluation`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEvalMsg({ type: "success", text: `Evaluation successfully saved! Total Score: ${totalEvalScore}/100 (${calculatedGrade.replace('_', ' ')}). Vendor ranking has been updated.` });
        loadVendors();
      } else {
        const err = await res.json();
        setEvalMsg({ type: "error", text: err.detail?.message || "Failed to save evaluation." });
      }
    } catch (err) {
      console.error(err);
      setEvalMsg({ type: "error", text: "Network error saving evaluation." });
    } finally {
      setSavingEval(false);
    }
  };

  const filteredVendors = [...vendors].filter(v => 
    filterStatus === "ALL" ? true : v.status === filterStatus
  ).sort((a, b) => {
    if (sortBy === "score") {
      const scoreA = a.latest_evaluation?.total_score ?? -1;
      const scoreB = b.latest_evaluation?.total_score ?? -1;
      return scoreB - scoreA;
    }
    if (sortBy === "turnover") {
      const tA = a.avg_turnover ?? 0;
      const tB = b.avg_turnover ?? 0;
      return tB - tA;
    }
    if (sortBy === "projects") {
      const pA = a.projects_completed_count ?? 0;
      const pB = b.projects_completed_count ?? 0;
      return pB - pA;
    }
    return 0;
  });

  const selectVendorForInspection = (id: string, initialTab: any = "evaluation") => {
    setSelectedVendorId(id);
    setActiveTab(initialTab);
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
                      { id: "evaluation", label: "⭐ 5-Point Evaluation (Best Vendor)", highlight: true },
                      { id: "profile", label: "Profile & Contacts" },
                      { id: "financials", label: "Financials & Bank" },
                      { id: "projects", label: "Project History" },
                      { id: "declarations", label: "Classification & Pre-Qual" },
                      { id: "documents", label: "Documents & Catalogs" }
                  ].map(tab => (
                      <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`pb-4 pt-2 text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                              activeTab === tab.id 
                              ? "border-blue-600 text-blue-600" 
                              : tab.highlight
                              ? "border-transparent text-amber-700 font-bold hover:text-amber-800"
                              : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                          }`}
                      >
                          {tab.label}
                      </button>
                  ))}
              </div>
              
              {/* Tab Content Container */}
              <div className="p-6 bg-gray-50">

                  {/* TAB 0: 5-Point Empanelment Evaluation */}
                  {activeTab === "evaluation" && (
                      <div className="space-y-6">

                          {/* Evaluation Scoreboard Banner */}
                          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50">
                              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                  <div>
                                      <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-amber-400/30 mb-2">
                                          <span>🏆</span> Vendor Pre-Qualification Evaluation Matrix
                                      </div>
                                      <h3 className="text-2xl font-bold tracking-tight">5-Point Empanelment Scoring</h3>
                                      <p className="text-slate-300 text-xs mt-1 max-w-2xl leading-relaxed">
                                          Objectively evaluate this vendor against the 5 criteria provided during registration. Score each criterion (0–20 points) to compute their total score out of 100, identify whether they qualify, and rank them as the best vendor.
                                      </p>
                                  </div>

                                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 flex items-center gap-6 self-stretch sm:self-auto justify-around">
                                      <div className="text-center">
                                          <div className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Total Score</div>
                                          <div className="text-3xl sm:text-4xl font-black text-amber-400 font-mono mt-0.5">
                                              {totalEvalScore}<span className="text-base sm:text-xl text-slate-400 font-normal">/100</span>
                                          </div>
                                      </div>

                                      <div className="h-10 w-px bg-white/20"></div>

                                      <div className="text-center">
                                          <div className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Classification</div>
                                          <div className="mt-1">
                                              <span className={`inline-block px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                                  totalEvalScore >= 85 ? "bg-emerald-500 text-white shadow-xs" :
                                                  totalEvalScore >= 70 ? "bg-blue-500 text-white shadow-xs" :
                                                  totalEvalScore >= 50 ? "bg-amber-500 text-slate-950 shadow-xs" :
                                                  "bg-red-500 text-white shadow-xs"
                                              }`}>
                                                  {totalEvalScore >= 85 ? "Grade A (Best)" :
                                                   totalEvalScore >= 70 ? "Grade B (Qualified)" :
                                                   totalEvalScore >= 50 ? "Grade C (Marginal)" : "Grade D (Ineligible)"}
                                              </span>
                                          </div>
                                      </div>

                                      <div className="h-10 w-px bg-white/20"></div>

                                      <div className="text-center">
                                          <div className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Decision</div>
                                          <div className="text-sm font-bold text-white mt-1">
                                              {evalRecommendation === "RECOMMENDED_BEST" ? "⭐ Top Choice" :
                                               evalRecommendation === "QUALIFIED" ? "✅ Qualified" :
                                               evalRecommendation === "NEEDS_CLARIFICATION" ? "⚠️ Clarify" : "❌ Rejected"}
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-6 pt-4 border-t border-white/10">
                                  <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-medium">
                                      <span>Cumulative Score Progress</span>
                                      <span>{totalEvalScore}% of 100 Points</span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
                                      <div 
                                          className={`h-full rounded-full transition-all duration-500 ${
                                              totalEvalScore >= 85 ? "bg-gradient-to-r from-emerald-500 to-green-400" :
                                              totalEvalScore >= 70 ? "bg-gradient-to-r from-blue-500 to-cyan-400" :
                                              totalEvalScore >= 50 ? "bg-gradient-to-r from-amber-500 to-yellow-400" :
                                              "bg-gradient-to-r from-red-600 to-red-400"
                                          }`}
                                          style={{ width: `${Math.min(100, Math.max(5, totalEvalScore))}%` }}
                                      ></div>
                                  </div>
                              </div>
                          </div>

                          {evalMsg && (
                              <div className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between ${
                                  evalMsg.type === "success" 
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                                      : "bg-red-50 border-red-200 text-red-800"
                              }`}>
                                  <span>{evalMsg.text}</span>
                                  <button onClick={() => setEvalMsg(null)} className="text-xs font-bold underline ml-4">Dismiss</button>
                              </div>
                          )}

                          {/* 5 Criteria Evaluation Cards Grid */}
                          <div className="space-y-6">

                              {/* CRITERION 1: Hospital Projects > 300 Beds */}
                              <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                                  <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                      <div>
                                          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                                              Criterion 1 · Max 20 Pts
                                          </span>
                                          <h4 className="text-base font-bold text-gray-900 mt-1">
                                              Projects in Hospitals with &gt;300 Beds (Last 3 Years: FY 25-26, FY 24-25, FY 23-24)
                                          </h4>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 cursor-pointer">
                                              <input 
                                                  type="checkbox"
                                                  checked={evalHospitalsMeets}
                                                  onChange={(e) => setEvalHospitalsMeets(e.target.checked)}
                                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                              />
                                              <span>Meets Criterion</span>
                                          </label>
                                          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
                                              <span className="text-xs font-bold text-gray-500">Score:</span>
                                              <input 
                                                  type="number"
                                                  min="0"
                                                  max="20"
                                                  value={evalHospitalsScore}
                                                  onChange={(e) => setEvalHospitalsScore(Math.min(20, Math.max(0, Number(e.target.value))))}
                                                  className="w-12 text-center font-bold text-sm bg-white border border-gray-300 rounded py-0.5 px-1 font-mono focus:ring-blue-500 focus:border-blue-500"
                                              />
                                              <span className="text-xs text-gray-500 font-bold">/20</span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                      {/* Vendor Submitted Data */}
                                      <div className="lg:col-span-7 space-y-3">
                                          <div className="flex items-center justify-between text-xs text-gray-500 border-b pb-1 font-semibold">
                                              <span>Vendor Submitted Information</span>
                                              <span className="text-gray-700">Total Reported Projects: <strong>{selectedVendor.projects_completed_count || (selectedVendor.projects || []).length}</strong></span>
                                          </div>
                                          {selectedVendor.projects && selectedVendor.projects.length > 0 ? (
                                              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                                                      <thead className="bg-gray-50 text-gray-600">
                                                          <tr>
                                                              <th className="px-3 py-2 text-left font-bold">Hospital / Institution</th>
                                                              <th className="px-3 py-2 text-left font-bold">Year</th>
                                                              <th className="px-3 py-2 text-center font-bold">Bed Count</th>
                                                              <th className="px-3 py-2 text-right font-bold">Cost (Cr)</th>
                                                              <th className="px-3 py-2 text-left font-bold">Duration</th>
                                                          </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-gray-100 bg-white">
                                                          {selectedVendor.projects.map((p: any) => (
                                                              <tr key={p.id} className={p.is_300_plus_beds ? "bg-emerald-50/50" : ""}>
                                                                  <td className="px-3 py-2 font-medium text-gray-900">{p.hospital_name}</td>
                                                                  <td className="px-3 py-2 text-gray-600">{p.financial_year || "—"}</td>
                                                                  <td className="px-3 py-2 text-center">
                                                                      <span className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${p.is_300_plus_beds ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                                                                          {p.bed_count || (p.is_300_plus_beds ? '>300' : '<300')} Beds
                                                                      </span>
                                                                  </td>
                                                                  <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">
                                                                      {p.project_cost != null ? `₹${p.project_cost} Cr` : "—"}
                                                                  </td>
                                                                  <td className="px-3 py-2 text-gray-600">{p.project_duration || "—"}</td>
                                                              </tr>
                                                          ))}
                                                      </tbody>
                                                  </table>
                                              </div>
                                          ) : (
                                              <p className="text-xs text-gray-500 italic p-3 bg-gray-50 rounded border">No hospital project line items entered in table.</p>
                                          )}
                                      </div>

                                      {/* Evaluator Remarks */}
                                      <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                                          <div>
                                              <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator Notes & Assessment for Criterion 1</label>
                                              <textarea 
                                                  value={evalHospitalsRemarks}
                                                  onChange={(e) => setEvalHospitalsRemarks(e.target.value)}
                                                  rows={3}
                                                  placeholder="e.g. Verified 3 projects in 300+ bed medical colleges (SMS Jaipur, AIIMS). Excellent track record."
                                                  className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                              />
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                              <span>Score Guideline: 18-20 = ≥3 Major 300+ Bed Hospitals</span>
                                              <span className="font-bold text-blue-700">{evalHospitalsScore} Pts</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* CRITERION 2: Turnover in Last 3 Years */}
                              <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                                  <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                      <div>
                                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                              Criterion 2 · Max 20 Pts
                                          </span>
                                          <h4 className="text-base font-bold text-gray-900 mt-1">
                                              Turnover of the Company in Last 3 Years (FY 25-26, FY 24-25, FY 23-24)
                                          </h4>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 cursor-pointer">
                                              <input 
                                                  type="checkbox"
                                                  checked={evalTurnoverMeets}
                                                  onChange={(e) => setEvalTurnoverMeets(e.target.checked)}
                                                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                                              />
                                              <span>Meets Criterion</span>
                                          </label>
                                          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                                              <span className="text-xs font-bold text-gray-500">Score:</span>
                                              <input 
                                                  type="number"
                                                  min="0"
                                                  max="20"
                                                  value={evalTurnoverScore}
                                                  onChange={(e) => setEvalTurnoverScore(Math.min(20, Math.max(0, Number(e.target.value))))}
                                                  className="w-12 text-center font-bold text-sm bg-white border border-gray-300 rounded py-0.5 px-1 font-mono focus:ring-emerald-500 focus:border-emerald-500"
                                              />
                                              <span className="text-xs text-gray-500 font-bold">/20</span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                      {/* Vendor Submitted Data */}
                                      <div className="lg:col-span-7">
                                          <div className="text-xs text-gray-500 border-b pb-1 font-semibold mb-3">Vendor Reported Turnover</div>
                                          <div className="grid grid-cols-3 gap-3 text-center">
                                              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                  <span className="text-[11px] text-gray-500 block font-semibold">FY 2025-26 (Est/Ongoing)</span>
                                                  <span className="text-base font-bold text-gray-900 font-mono mt-1 block">
                                                      {selectedVendor.financials?.[0]?.turnover_fy1 != null ? `₹${selectedVendor.financials[0].turnover_fy1} Cr` : "—"}
                                                  </span>
                                              </div>
                                              <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200">
                                                  <span className="text-[11px] text-emerald-800 block font-bold">FY 2024-25 (Audited)</span>
                                                  <span className="text-base font-black text-emerald-900 font-mono mt-1 block">
                                                      {selectedVendor.financials?.[0]?.turnover_fy2 != null ? `₹${selectedVendor.financials[0].turnover_fy2} Cr` : "—"}
                                                  </span>
                                              </div>
                                              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                  <span className="text-[11px] text-gray-500 block font-semibold">FY 2023-24</span>
                                                  <span className="text-base font-bold text-gray-900 font-mono mt-1 block">
                                                      {selectedVendor.financials?.[0]?.turnover_fy3 != null ? `₹${selectedVendor.financials[0].turnover_fy3} Cr` : "—"}
                                                  </span>
                                              </div>
                                          </div>
                                          <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded text-xs flex justify-between">
                                              <span className="text-gray-600">Average 3-Year Annual Turnover:</span>
                                              <span className="font-bold text-gray-900 font-mono">
                                                  {(() => {
                                                      const f = selectedVendor.financials?.[0];
                                                      if (!f) return "—";
                                                      const vals = [f.turnover_fy1, f.turnover_fy2, f.turnover_fy3].filter((x: any) => x != null && Number(x) > 0);
                                                      if (vals.length === 0) return "—";
                                                      const avg = vals.reduce((a: number, b: number) => a + Number(b), 0) / vals.length;
                                                      return `₹${avg.toFixed(2)} Crore`;
                                                  })()}
                                              </span>
                                          </div>
                                      </div>

                                      {/* Evaluator Remarks */}
                                      <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                                          <div>
                                              <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator Notes & Financial Stability Rating</label>
                                              <textarea 
                                                  value={evalTurnoverRemarks}
                                                  onChange={(e) => setEvalTurnoverRemarks(e.target.value)}
                                                  rows={3}
                                                  placeholder="e.g. Healthy steady turnover growth over 3 years. Substantial working capital."
                                                  className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                                              />
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                              <span>Score Guideline: 18-20 = Exceeds turnover benchmark</span>
                                              <span className="font-bold text-emerald-700">{evalTurnoverScore} Pts</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* CRITERION 3: High-Value Projects (> Rs. [X] Crore) */}
                              <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                                  <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                      <div>
                                          <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full">
                                              Criterion 3 · Max 20 Pts
                                          </span>
                                          <h4 className="text-base font-bold text-gray-900 mt-1">
                                              Projects Delivered with Project Cost &gt; Rs. {selectedVendor.high_value_projects_threshold_cr || 1.0} Crore
                                          </h4>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 cursor-pointer">
                                              <input 
                                                  type="checkbox"
                                                  checked={evalHighValueMeets}
                                                  onChange={(e) => setEvalHighValueMeets(e.target.checked)}
                                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                                              />
                                              <span>Meets Criterion</span>
                                          </label>
                                          <div className="flex items-center gap-1 bg-purple-50 border border-purple-200 px-3 py-1 rounded-lg">
                                              <span className="text-xs font-bold text-gray-500">Score:</span>
                                              <input 
                                                  type="number"
                                                  min="0"
                                                  max="20"
                                                  value={evalHighValueScore}
                                                  onChange={(e) => setEvalHighValueScore(Math.min(20, Math.max(0, Number(e.target.value))))}
                                                  className="w-12 text-center font-bold text-sm bg-white border border-gray-300 rounded py-0.5 px-1 font-mono focus:ring-purple-500 focus:border-purple-500"
                                              />
                                              <span className="text-xs text-gray-500 font-bold">/20</span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                      {/* Vendor Submitted Data */}
                                      <div className="lg:col-span-7 space-y-2">
                                          <div className="text-xs text-gray-500 border-b pb-1 font-semibold">Vendor Scale & High-Value Delivery</div>
                                          <div className="flex items-center gap-4 py-2">
                                              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-center flex-1">
                                                  <span className="text-xs text-purple-700 font-semibold block">Projects &gt; ₹{selectedVendor.high_value_projects_threshold_cr || 1.0} Cr</span>
                                                  <span className="text-2xl font-black text-purple-900 font-mono mt-0.5 block">
                                                      {selectedVendor.high_value_projects_count ?? 
                                                       (selectedVendor.projects || []).filter((p: any) => Number(p.project_cost) >= (selectedVendor.high_value_projects_threshold_cr || 1.0)).length}
                                                  </span>
                                              </div>
                                              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center flex-1">
                                                  <span className="text-xs text-gray-500 font-semibold block">Years in Business</span>
                                                  <span className="text-2xl font-bold text-gray-800 font-mono mt-0.5 block">
                                                      {selectedVendor.years_in_business || "—"} Yrs
                                                  </span>
                                              </div>
                                          </div>
                                          <div className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded border">
                                              Confirmed high-value institutional installations reported:{" "}
                                              {(selectedVendor.projects || [])
                                                  .filter((p: any) => Number(p.project_cost) >= (selectedVendor.high_value_projects_threshold_cr || 1.0))
                                                  .map((p: any) => `${p.hospital_name} (₹${p.project_cost} Cr)`)
                                                  .join(", ") || "None explicitly listed in project breakdown."}
                                          </div>
                                      </div>

                                      {/* Evaluator Remarks */}
                                      <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                                          <div>
                                              <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator Notes for Large-Scale Delivery</label>
                                              <textarea 
                                                  value={evalHighValueRemarks}
                                                  onChange={(e) => setEvalHighValueRemarks(e.target.value)}
                                                  rows={3}
                                                  placeholder="e.g. Demonstrated capability to handle turnkey equipment installations exceeding benchmark."
                                                  className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                              />
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                              <span>Score Guideline: 18-20 = High capacity & volume</span>
                                              <span className="font-bold text-purple-700">{evalHighValueScore} Pts</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* CRITERION 4: Infrastructure / Service Base at Jaipur & Rajasthan */}
                              <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                                  <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                      <div>
                                          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                              Criterion 4 · Max 20 Pts
                                          </span>
                                          <h4 className="text-base font-bold text-gray-900 mt-1">
                                              Infrastructure / Service Base at Jaipur and/or Rajasthan
                                          </h4>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 cursor-pointer">
                                              <input 
                                                  type="checkbox"
                                                  checked={evalServiceBaseMeets}
                                                  onChange={(e) => setEvalServiceBaseMeets(e.target.checked)}
                                                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                                              />
                                              <span>Meets Criterion</span>
                                          </label>
                                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                                              <span className="text-xs font-bold text-gray-500">Score:</span>
                                              <input 
                                                  type="number"
                                                  min="0"
                                                  max="20"
                                                  value={evalServiceBaseScore}
                                                  onChange={(e) => setEvalServiceBaseScore(Math.min(20, Math.max(0, Number(e.target.value))))}
                                                  className="w-12 text-center font-bold text-sm bg-white border border-gray-300 rounded py-0.5 px-1 font-mono focus:ring-amber-500 focus:border-amber-500"
                                              />
                                              <span className="text-xs text-gray-500 font-bold">/20</span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                      {/* Vendor Submitted Data */}
                                      <div className="lg:col-span-7 space-y-3">
                                          <div className="text-xs text-gray-500 border-b pb-1 font-semibold">Vendor Local Presence Details</div>
                                          <div className="flex items-center gap-3">
                                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                  selectedVendor.has_service_base_jaipur ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
                                              }`}>
                                                  {selectedVendor.has_service_base_jaipur ? '✓ Has Local Service Base in Jaipur/Rajasthan' : '✗ No Dedicated Jaipur Service Base'}
                                              </span>
                                              <span className="text-xs text-gray-500 font-medium">
                                                  Registered City: <strong>{selectedVendor.city || 'N/A'}, {selectedVendor.state_province || 'N/A'}</strong>
                                              </span>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                                              <span className="font-bold text-gray-700 block mb-1">Local Service / Depot Details:</span>
                                              <p className="text-gray-600">
                                                  {selectedVendor.financials?.[0]?.infrastructure_base_details || 
                                                   [selectedVendor.address_line_1, selectedVendor.city, selectedVendor.state_province].filter(Boolean).join(", ") || 
                                                   "No dedicated infrastructure description provided."}
                                              </p>
                                          </div>
                                      </div>

                                      {/* Evaluator Remarks */}
                                      <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                                          <div>
                                              <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator Notes on Local Support & TAT</label>
                                              <textarea 
                                                  value={evalServiceBaseRemarks}
                                                  onChange={(e) => setEvalServiceBaseRemarks(e.target.value)}
                                                  rows={3}
                                                  placeholder="e.g. Local service depot located at Sitapura Jaipur. 2-4 hour turnaround time verified."
                                                  className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                                              />
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                              <span>Score Guideline: 20 = Full workshop & spares in Jaipur</span>
                                              <span className="font-bold text-amber-700">{evalServiceBaseScore} Pts</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* CRITERION 5: Audited Balance Sheet for FY 2024-25 */}
                              <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                                  <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                      <div>
                                          <span className="text-xs font-bold uppercase tracking-wider text-cyan-700 bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 rounded-full">
                                              Criterion 5 · Max 20 Pts
                                          </span>
                                          <h4 className="text-base font-bold text-gray-900 mt-1">
                                              Audited Balance Sheet for FY 2024-25 (with CA Certification)
                                          </h4>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 cursor-pointer">
                                              <input 
                                                  type="checkbox"
                                                  checked={evalBalanceSheetVerified}
                                                  onChange={(e) => setEvalBalanceSheetVerified(e.target.checked)}
                                                  className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                                              />
                                              <span>Document Verified</span>
                                          </label>
                                          <div className="flex items-center gap-1 bg-cyan-50 border border-cyan-200 px-3 py-1 rounded-lg">
                                              <span className="text-xs font-bold text-gray-500">Score:</span>
                                              <input 
                                                  type="number"
                                                  min="0"
                                                  max="20"
                                                  value={evalBalanceSheetScore}
                                                  onChange={(e) => setEvalBalanceSheetScore(Math.min(20, Math.max(0, Number(e.target.value))))}
                                                  className="w-12 text-center font-bold text-sm bg-white border border-gray-300 rounded py-0.5 px-1 font-mono focus:ring-cyan-500 focus:border-cyan-500"
                                              />
                                              <span className="text-xs text-gray-500 font-bold">/20</span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                      {/* Vendor Submitted Data */}
                                      <div className="lg:col-span-7 space-y-3">
                                          <div className="text-xs text-gray-500 border-b pb-1 font-semibold">Uploaded Compliance Attachment</div>
                                          {(() => {
                                              const bsDoc = vendorDocs.find(d => d.document_type === "BALANCE_SHEET");
                                              if (bsDoc) {
                                                  return (
                                                      <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-xl flex items-center justify-between">
                                                          <div className="flex items-center space-x-3">
                                                              <div className="text-2xl">📑</div>
                                                              <div>
                                                                  <span className="font-bold text-gray-900 text-xs block">Audited Balance Sheet (FY 2024-25)</span>
                                                                  <span className="text-gray-500 text-[11px] block truncate max-w-xs">{bsDoc.latest_version?.original_filename || "balance_sheet_2024_25.pdf"}</span>
                                                              </div>
                                                          </div>
                                                          <button 
                                                              onClick={() => handleViewPdf(selectedVendor.id, bsDoc.id)}
                                                              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                                                          >
                                                              View PDF 📄
                                                          </button>
                                                      </div>
                                                  );
                                              }
                                              return (
                                                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                                                      ⚠️ No document tagged as "Audited Balance Sheet (FY 2024-25)" found. Check "Documents & Catalogs" tab to view all general uploads.
                                                  </div>
                                              );
                                          })()}
                                      </div>

                                      {/* Evaluator Remarks */}
                                      <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                                          <div>
                                              <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator Notes on Balance Sheet & CA Audit</label>
                                              <textarea 
                                                  value={evalBalanceSheetRemarks}
                                                  onChange={(e) => setEvalBalanceSheetRemarks(e.target.value)}
                                                  rows={3}
                                                  placeholder="e.g. Audited balance sheet verified. CA signed with UDIN number, positive net worth."
                                                  className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500"
                                              />
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                              <span>Score Guideline: 20 = CA signed + UDIN verified</span>
                                              <span className="font-bold text-cyan-700">{evalBalanceSheetScore} Pts</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                          </div>

                          {/* Committee Final Assessment & Recommendation */}
                          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                              <h4 className="text-base font-bold text-gray-900 border-b pb-3 mb-4 flex items-center justify-between">
                                  <span>Procurement Committee Final Assessment & Recommendation</span>
                                  <span className="text-xs font-semibold text-gray-400 font-mono">ID: {selectedVendor.id}</span>
                              </h4>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                  <div>
                                      <label className="text-xs font-bold text-gray-700 block mb-1">Empanelment Recommendation</label>
                                      <select 
                                          value={evalRecommendation}
                                          onChange={(e) => setEvalRecommendation(e.target.value)}
                                          className="w-full text-sm font-bold border-gray-300 rounded-lg py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
                                      >
                                          <option value="RECOMMENDED_BEST">🏆 RECOMMENDED_BEST (Top Choice / Best Vendor)</option>
                                          <option value="QUALIFIED">✅ QUALIFIED (Meets All Standards)</option>
                                          <option value="NEEDS_CLARIFICATION">⚠️ NEEDS_CLARIFICATION (Additional Proof Required)</option>
                                          <option value="REJECTED">❌ REJECTED (Disqualified / Below Criteria)</option>
                                      </select>
                                      <span className="text-[11px] text-gray-500 mt-1 block">Marks whether this vendor is ranked best in their category.</span>
                                  </div>

                                  <div>
                                      <label className="text-xs font-bold text-gray-700 block mb-1">Computed Evaluation Grade</label>
                                      <select 
                                          value={evalGrade}
                                          onChange={(e) => setEvalGrade(e.target.value)}
                                          className="w-full text-sm font-bold border-gray-300 rounded-lg py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
                                      >
                                          <option value="A_GRADE">Grade A (Score ≥ 85) - Top Tier</option>
                                          <option value="B_GRADE">Grade B (Score 70 - 84) - Qualified</option>
                                          <option value="C_GRADE">Grade C (Score 50 - 69) - Average</option>
                                          <option value="D_GRADE">Grade D (Score &lt; 50) - Ineligible</option>
                                      </select>
                                      <span className="text-[11px] text-gray-500 mt-1 block">Current Total Score: <strong>{totalEvalScore}/100</strong></span>
                                  </div>

                                  <div>
                                      <label className="text-xs font-bold text-gray-700 block mb-1">Evaluator / Committee Name</label>
                                      <input 
                                          type="text"
                                          value={evalEvaluatorName}
                                          onChange={(e) => setEvalEvaluatorName(e.target.value)}
                                          placeholder="e.g. Procurement Committee / Admin"
                                          className="w-full text-sm font-medium border-gray-300 rounded-lg py-2.5 px-3 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
                                      />
                                      <span className="text-[11px] text-gray-500 mt-1 block">Sign-off identifier for audit compliance.</span>
                                  </div>
                              </div>

                              <div className="mb-6">
                                  <label className="text-xs font-bold text-gray-700 block mb-1">Overall Committee Summary & Empanelment Justification</label>
                                  <textarea 
                                      value={evalSummaryNotes}
                                      onChange={(e) => setEvalSummaryNotes(e.target.value)}
                                      rows={3}
                                      placeholder="Provide final justification on why this vendor is ranked best or what specific strengths they bring (e.g., Extensive bed capacity experience, strong local Jaipur service base, verified balance sheet)..."
                                      className="w-full text-xs p-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                  />
                              </div>

                              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100">
                                  <div className="text-xs text-gray-500">
                                      Saving updates the vendor's ranking and displays their badge in the comparative table.
                                  </div>
                                  <div className="flex gap-3 w-full sm:w-auto">
                                      <button 
                                          type="button"
                                          onClick={handleSaveEvaluation}
                                          disabled={savingEval}
                                          className="flex-1 sm:flex-initial px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                                      >
                                          {savingEval ? (
                                              <>
                                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                  <span>Saving Evaluation...</span>
                                              </>
                                          ) : (
                                              <>
                                                  <span>💾 Save & Update Vendor Ranking</span>
                                              </>
                                          )}
                                      </button>
                                  </div>
                              </div>
                          </div>

                      </div>
                  )}

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
            <div className="px-6 py-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center">
                  Registered Vendors & Empanelment Rankings
                  <span className="ml-3 bg-blue-100 text-blue-800 text-xs py-0.5 px-2.5 rounded-full font-bold">{filteredVendors.length}</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sorted according to 5-point pre-qualification scores to easily identify the best vendor.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="text-xs border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-2.5 pr-7 shadow-xs font-semibold bg-white text-gray-800"
                  >
                    <option value="score">🏆 Best Ranking (By Score)</option>
                    <option value="turnover">💰 Turnover (Highest First)</option>
                    <option value="projects">🏥 Hospital Projects (Most First)</option>
                    <option value="default">⏱️ Registration Date (Newest)</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Status:</span>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-xs border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-2.5 pr-7 shadow-xs font-medium bg-white text-gray-800"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
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
                <p className="text-lg font-medium">No vendors found matching criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left">
                  <thead className="bg-white">
                    <tr className="border-b border-gray-200">
                      <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Vendor Legal Name</th>
                      <th className="px-4 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">1. &gt;300 Bed Projects</th>
                      <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">2. Avg Turnover</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">4. Jaipur Base</th>
                      <th className="px-5 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">🏆 Evaluation &amp; Rank</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredVendors.map((v, index) => {
                      const latestEval = v.latest_evaluation;
                      const isTopRanked = sortBy === "score" && latestEval && index === 0 && latestEval.total_score >= 80;

                      return (
                        <tr 
                          key={v.id} 
                          className={`hover:bg-blue-50/60 transition-colors group cursor-pointer ${
                            isTopRanked ? "bg-amber-50/40" : ""
                          }`} 
                          onClick={() => selectVendorForInspection(v.id, "evaluation")}
                        >
                          {/* Company Name & PAN */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {isTopRanked && (
                                <span className="text-base" title="Top Ranked Best Vendor">👑</span>
                              )}
                              <div>
                                <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {v.legal_name}
                                </div>
                                <div className="text-xs text-gray-500 font-mono mt-0.5">
                                  PAN: {v.pan_number || 'N/A'} • {v.organization_type || 'Vendor'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-600">
                            <div>{v.city || "—"}</div>
                            <div className="text-gray-400 text-[11px]">{v.state_province || v.country || "India"}</div>
                          </td>

                          {/* Criterion 1: Hospital Projects */}
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              (v.projects_completed_count || 0) > 0 
                                ? "bg-blue-50 text-blue-700 border border-blue-200" 
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {v.projects_completed_count || 0} Project{v.projects_completed_count !== 1 ? "s" : ""}
                            </span>
                          </td>

                          {/* Criterion 2: 3-Yr Turnover */}
                          <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-mono font-bold text-gray-900">
                            {v.avg_turnover != null && Number(v.avg_turnover) > 0 ? (
                              <span className="text-emerald-700">₹{Number(v.avg_turnover).toFixed(2)} Cr</span>
                            ) : v.turnover_fy2 != null && Number(v.turnover_fy2) > 0 ? (
                              <span className="text-emerald-700">₹{Number(v.turnover_fy2).toFixed(2)} Cr</span>
                            ) : (
                              <span className="text-gray-400 font-normal">—</span>
                            )}
                          </td>

                          {/* Criterion 4: Jaipur Base */}
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            {v.has_service_base_jaipur ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-800 border border-green-200">
                                ✓ Jaipur Base
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Evaluation Score & Best Rank */}
                          <td className="px-5 py-4 whitespace-nowrap text-center">
                            {latestEval ? (
                              <div className="inline-flex flex-col items-center">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-black text-sm text-gray-900">
                                    {latestEval.total_score}
                                  </span>
                                  <span className="text-[11px] text-gray-400 font-normal">/100</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    latestEval.total_score >= 85 ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                                    latestEval.total_score >= 70 ? "bg-blue-100 text-blue-800 border border-blue-300" :
                                    latestEval.total_score >= 50 ? "bg-amber-100 text-amber-800 border border-amber-300" :
                                    "bg-red-100 text-red-800 border border-red-300"
                                  }`}>
                                    {latestEval.evaluation_grade ? latestEval.evaluation_grade.replace('_GRADE', '') : (latestEval.total_score >= 85 ? 'A' : 'B')}
                                  </span>
                                </div>
                                {latestEval.recommendation === "RECOMMENDED_BEST" ? (
                                  <span className="mt-1 inline-flex items-center text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                                    ⭐ Best Choice
                                  </span>
                                ) : latestEval.recommendation === "QUALIFIED" ? (
                                  <span className="mt-1 inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                                    ✓ Qualified
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => { e.stopPropagation(); selectVendorForInspection(v.id, "evaluation"); }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                              >
                                ✍️ Evaluate
                              </button>
                            )}
                          </td>

                          {/* Workflow Status */}
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${
                              v.status === "APPROVED" ? "bg-green-100 text-green-800 border border-green-200" :
                              v.status === "REJECTED" ? "bg-red-100 text-red-800 border border-red-200" :
                              v.status === "SUBMITTED" || v.status === "UNDER_REVIEW" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                              "bg-yellow-100 text-yellow-800 border border-yellow-200"
                            }`}>
                              {v.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); selectVendorForInspection(v.id, "evaluation"); }}
                                className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1.5 rounded-lg font-bold group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs text-xs"
                              >
                                Inspect &amp; Score →
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v.id, v.legal_name); }}
                                disabled={verifying}
                                className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-bold transition-all shadow-xs text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
