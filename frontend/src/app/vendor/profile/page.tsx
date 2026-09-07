"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../../lib/api/client";
import { useAuth } from "../../../../lib/auth/AuthContext";

export default function CompleteWhiteVendorProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { logout } = useAuth();
  
  const [activeSection, setActiveSection] = useState(1);

  // Section 1: Identification
  const [vendorCode, setVendorCode] = useState("V001");
  const [vendorStatus, setVendorStatus] = useState("Active");
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [vendorGroup, setVendorGroup] = useState("OEM");
  const [vendorType, setVendorType] = useState("Manufacturer");
  const [vendorCategory, setVendorCategory] = useState("Medical Devices");
  const [panNumber, setPanNumber] = useState("");
  const [gstin, setGstin] = useState("");
  const [gstRegistrationType, setGstRegistrationType] = useState("Regular");
  const [msmeRegistered, setMsmeRegistered] = useState(false);
  const [tdsApplicable, setTdsApplicable] = useState(true);
  const [otherRegulatoryRegistrations, setOtherRegulatoryRegistrations] = useState("");

  // Section 2: Address & Contact
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [country, setCountry] = useState("India");
  const [stateProvince, setStateProvince] = useState("Delhi");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [primaryContactPerson, setPrimaryContactPerson] = useState("");
  const [contactDesignation, setContactDesignation] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [alternateEmail, setAlternateEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Section 3: Head of Organisation
  const [headName, setHeadName] = useState("");
  const [headDesignation, setHeadDesignation] = useState("Managing Director");
  const [headEmail, setHeadEmail] = useState("");
  const [headPhone, setHeadPhone] = useState("");

  // Section 4: Bank Details
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountType, setAccountType] = useState("Current");

  // Section 5: Commercial Terms
  const [paymentTerms, setPaymentTerms] = useState("Net 30 Days");
  const [creditDays, setCreditDays] = useState<number | "">(30);
  const [currency, setCurrency] = useState("INR");
  const [freightTerms, setFreightTerms] = useState("FOR Destination / Free Delivery");
  const [deliveryTerms, setDeliveryTerms] = useState("Door Delivery");
  const [priceListApplicable, setPriceListApplicable] = useState("Standard Institutional");
  const [rateContractApplicable, setRateContractApplicable] = useState(false);

  // Section 6: Classification
  const [supplyCategory, setSupplyCategory] = useState("Equipment & Infrastructure");
  const [productServiceType, setProductServiceType] = useState("Supply & Installation");
  const [geographicalCoverage, setGeographicalCoverage] = useState("National");
  const [primaryBusinessType, setPrimaryBusinessType] = useState("Private Limited Company");
  const [supplyCategoriesList, setSupplyCategoriesList] = useState<string[]>(["Medical Equipment"]);

  // Section 7: Pre-Qualification & Declarations
  const [turnoverFy1, setTurnoverFy1] = useState<number | "">("");
  const [turnoverFy2, setTurnoverFy2] = useState<number | "">("");
  const [turnoverFy3, setTurnoverFy3] = useState<number | "">("");
  const [yearsInBusiness, setYearsInBusiness] = useState<number | "">(14);
  const [projectsCompletedCount, setProjectsCompletedCount] = useState<number | "">(28);
  const [highValueProjectsCount, setHighValueProjectsCount] = useState<number | "">("");
  const [hasServiceBaseJaipur, setHasServiceBaseJaipur] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [pendingLitigation, setPendingLitigation] = useState(false);
  const [notDebarredDeclaration, setNotDebarredDeclaration] = useState(true);

  // Dynamic Projects Table
  const [projects, setProjects] = useState<any[]>([
    { hospital_name: "", bed_count: "", project_cost: "", financial_year: "", scope_of_work: "", is_300_plus_beds: false }
  ]);

  // Section 8: Documents
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  const isLocked = Boolean(profile && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(profile.status));

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await fetchApi("/api/v1/vendor/me");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        
        if (data.vendor_code) setVendorCode(data.vendor_code);
        setLegalName(data.legal_name || "");
        setDisplayName(data.display_name || data.legal_name || "");
        setShortName(data.short_name || "");
        setVendorGroup(data.vendor_group || "OEM");
        setVendorType(data.vendor_type || "Manufacturer");
        setVendorCategory(data.vendor_category || "Medical Devices");
        setPanNumber(data.pan_number || "");
        setGstin(data.gstin || "");
        setGstRegistrationType(data.gst_registration_type || "Regular");
        setMsmeRegistered(data.msme_registered || false);
        setTdsApplicable(data.tds_applicable ?? true);
        setOtherRegulatoryRegistrations(data.other_regulatory_registrations || "");

        setAddressLine1(data.address_line_1 || "");
        setAddressLine2(data.address_line_2 || "");
        setCountry(data.country || "India");
        setStateProvince(data.state_province || "Delhi");
        setCity(data.city || "");
        setPostalCode(data.postal_code || "");
        setPrimaryContactPerson(data.primary_contact_person || "");
        setContactDesignation(data.contact_designation || "");
        setPrimaryPhone(data.primary_phone || "");
        setAlternatePhone(data.alternate_phone || "");
        setPrimaryEmail(data.primary_email || "");
        setAlternateEmail(data.alternate_email || "");
        setWebsite(data.website || "");

        setHeadName(data.head_name || "");
        setHeadDesignation(data.head_designation || "Managing Director");
        setHeadEmail(data.head_email || "");
        setHeadPhone(data.head_phone || "");

        if (data.bank_details) {
          setBankName(data.bank_details.bank_name || "");
          setBranchName(data.bank_details.branch_name || "");
          setAccountName(data.bank_details.account_name || "");
          setAccountNumber(data.bank_details.account_number || "");
          setIfscCode(data.bank_details.ifsc_code || "");
          setAccountType(data.bank_details.account_type || "Current");
        }

        setPaymentTerms(data.payment_terms || "Net 30 Days");
        setCreditDays(data.credit_days ?? 30);
        setCurrency(data.currency || "INR");
        setFreightTerms(data.freight_terms || "FOR Destination / Free Delivery");
        setDeliveryTerms(data.delivery_terms || "Door Delivery");
        setPriceListApplicable(data.price_list_applicable || "Standard Institutional");
        setRateContractApplicable(data.rate_contract_applicable || false);

        setSupplyCategory(data.supply_category || "Equipment & Infrastructure");
        setProductServiceType(data.product_service_type || "Supply & Installation");
        setGeographicalCoverage(data.geographical_coverage || "National");
        setPrimaryBusinessType(data.primary_business_type || "Private Limited Company");
        if (data.supply_categories_list) {
          try { setSupplyCategoriesList(JSON.parse(data.supply_categories_list)); } catch {}
        }

        setYearsInBusiness(data.years_in_business ?? 14);
        setProjectsCompletedCount(data.projects_completed_count ?? 28);
        setHighValueProjectsCount(data.high_value_projects_count ?? "");
        setHasServiceBaseJaipur(data.has_service_base_jaipur || false);
        setIsBlacklisted(data.is_blacklisted || false);
        setPendingLitigation(data.pending_litigation || false);
        setNotDebarredDeclaration(data.not_debarred_declaration ?? true);

        if (data.financials) {
          setTurnoverFy1(data.financials.turnover_fy1 ?? "");
          setTurnoverFy2(data.financials.turnover_fy2 ?? "");
          setTurnoverFy3(data.financials.turnover_fy3 ?? "");
        }

        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
        }
      }
      
      const docRes = await fetchApi("/api/v1/vendor/documents");
      if (docRes.ok) setUploadedDocs(await docRes.json());
    } catch (err) {
      setMsg({ type: "error", text: "Error loading profile data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const getSectionStatus = (sectionId: number) => {
    switch (sectionId) {
      case 1: // Identification
        return Boolean(legalName && panNumber && gstin);
      case 2: // Address & Contact
        return Boolean(addressLine1 && city && stateProvince && postalCode && primaryContactPerson && primaryPhone && primaryEmail);
      case 3: // Head of Org
        return Boolean(headName && headEmail && headPhone);
      case 4: // Bank Details
        return Boolean(bankName && accountNumber && ifscCode);
      case 5: // Commercial Terms
        return Boolean(paymentTerms && currency);
      case 6: // Classification
        return Boolean(supplyCategory && productServiceType && primaryBusinessType);
      case 7: // Pre-Qualification
        return Boolean(yearsInBusiness !== "" && projectsCompletedCount !== "" && notDebarredDeclaration);
      case 8: // Documents
        const uploadedTypes = uploadedDocs.map(d => d.document_type);
        const reqDocs = ["PAN", "GST", "CANCELLED_CHEQUE", "BALANCE_SHEET", "NON_DEBARMENT_DECLARATION"];
        return reqDocs.every(t => uploadedTypes.includes(t));
      default:
        return false;
    }
  };

  const calculateCompletion = () => {
    const sectionIds = [1, 2, 3, 4, 5, 6, 7, 8];
    const completedCount = sectionIds.filter(id => getSectionStatus(id)).length;
    return Math.round((completedCount / sectionIds.length) * 100);
  };

  const validatePreSubmission = () => {
    const missing: { section: number; item: string }[] = [];

    if (!legalName.trim()) missing.push({ section: 1, item: "Legal Name of Company" });
    if (!panNumber.trim()) missing.push({ section: 1, item: "PAN Number" });
    if (!gstin.trim()) missing.push({ section: 1, item: "GST Number" });

    if (!addressLine1.trim()) missing.push({ section: 2, item: "Address Line 1" });
    if (!city.trim()) missing.push({ section: 2, item: "City" });
    if (!stateProvince.trim()) missing.push({ section: 2, item: "State" });
    if (!postalCode.trim()) missing.push({ section: 2, item: "PIN Code" });
    if (!primaryContactPerson.trim()) missing.push({ section: 2, item: "Primary Contact Person" });
    if (!primaryPhone.trim()) missing.push({ section: 2, item: "Primary Contact Mobile Number" });
    if (!primaryEmail.trim()) missing.push({ section: 2, item: "Official Email" });

    if (!headName.trim()) missing.push({ section: 3, item: "Head of Organisation Name" });
    if (!headEmail.trim()) missing.push({ section: 3, item: "Head of Organisation Email" });
    if (!headPhone.trim()) missing.push({ section: 3, item: "Head of Organisation Phone" });

    if (!bankName.trim()) missing.push({ section: 4, item: "Bank Name" });
    if (!accountNumber.trim()) missing.push({ section: 4, item: "Account Number" });
    if (!ifscCode.trim()) missing.push({ section: 4, item: "IFSC Code" });

    if (!notDebarredDeclaration) missing.push({ section: 7, item: "Non-Debarment Declaration Checkbox" });

    const uploadedTypes = uploadedDocs.map(d => d.document_type);
    const reqDocMap: Record<string, string> = {
      PAN: "PAN Card Copy",
      GST: "GST Registration Certificate",
      CANCELLED_CHEQUE: "Cancelled Cheque / Bank Letter",
      BALANCE_SHEET: "Audited Balance Sheet",
      NON_DEBARMENT_DECLARATION: "Non-Debarment Declaration"
    };

    Object.entries(reqDocMap).forEach(([code, name]) => {
      if (!uploadedTypes.includes(code)) {
        missing.push({ section: 8, item: `Document Upload: ${name}` });
      }
    });

    return missing;
  };

  const handleSaveProfile = async (shouldSubmit: boolean = false, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked) {
      setMsg({ type: "error", text: "Profile is locked after submission and cannot be edited." });
      return;
    }

    if (shouldSubmit) {
      const missingItems = validatePreSubmission();
      if (missingItems.length > 0) {
        const firstMissing = missingItems[0];
        setActiveSection(firstMissing.section);
        setMsg({
          type: "error",
          text: `Cannot submit profile. Please complete mandatory requirements:\n• ${missingItems.map(m => m.item).join("\n• ")}`
        });
        return;
      }
    }

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetchApi("/api/v1/vendor/me", {
        method: "PATCH",
        body: JSON.stringify({
          vendor_code: vendorCode,
          legal_name: legalName,
          display_name: displayName,
          short_name: shortName,
          organization_type: primaryBusinessType,
          vendor_group: vendorGroup,
          vendor_type: vendorType,
          vendor_category: vendorCategory,
          pan_number: panNumber,
          gstin: gstin,
          gst_registration_type: gstRegistrationType,
          msme_registered: msmeRegistered,
          tds_applicable: tdsApplicable,
          other_regulatory_registrations: otherRegulatoryRegistrations,

          address_line_1: addressLine1,
          address_line_2: addressLine2,
          country,
          state_province: stateProvince,
          city,
          postal_code: postalCode,
          primary_contact_person: primaryContactPerson,
          contact_designation: contactDesignation,
          primary_phone: primaryPhone,
          alternate_phone: alternatePhone,
          primary_email: primaryEmail,
          alternate_email: alternateEmail,
          website,

          head_name: headName,
          head_designation: headDesignation,
          head_email: headEmail,
          head_phone: headPhone,

          bank_details: {
            bank_name: bankName,
            branch_name: branchName,
            account_name: accountName,
            account_number: accountNumber,
            ifsc_code: ifscCode,
            account_type: accountType
          },

          payment_terms: paymentTerms,
          credit_days: creditDays === "" ? null : creditDays,
          currency,
          freight_terms: freightTerms,
          delivery_terms: deliveryTerms,
          price_list_applicable: priceListApplicable,
          rate_contract_applicable: rateContractApplicable,

          supply_category: supplyCategory,
          product_service_type: productServiceType,
          geographical_coverage: geographicalCoverage,
          primary_business_type: primaryBusinessType,
          supply_categories_list: JSON.stringify(supplyCategoriesList),

          years_in_business: yearsInBusiness === "" ? null : yearsInBusiness,
          projects_completed_count: projectsCompletedCount === "" ? null : projectsCompletedCount,
          high_value_projects_count: highValueProjectsCount === "" ? null : highValueProjectsCount,
          has_service_base_jaipur: hasServiceBaseJaipur,
          is_blacklisted: isBlacklisted,
          pending_litigation: pendingLitigation,
          not_debarred_declaration: notDebarredDeclaration,

          financials: {
            turnover_fy1: turnoverFy1 === "" ? null : turnoverFy1,
            turnover_fy2: turnoverFy2 === "" ? null : turnoverFy2,
            turnover_fy3: turnoverFy3 === "" ? null : turnoverFy3,
          },

          projects: projects.filter(p => p.hospital_name && p.hospital_name.trim().length > 0)
        }),
      });

      if (res.ok) {
        if (shouldSubmit) {
          const submitRes = await fetchApi("/api/v1/vendor/me/submit", { method: "POST" });
          if (submitRes.ok) {
            setMsg({ type: "success", text: "🔒 Vendor Master Profile submitted successfully for review! Your profile is now locked." });
            await loadProfile();
          } else {
            const err = await submitRes.json();
            setMsg({ type: "error", text: err.detail?.message || err.detail || "Profile saved, but submission failed." });
          }
        } else {
          setMsg({ type: "success", text: "Vendor profile draft saved successfully!" });
        }
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || err.detail || err.message || "Failed to save profile." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "An unexpected error occurred while saving." });
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentUpload = async (docType: string, file: File) => {
    if (isLocked) {
      setMsg({ type: "error", text: "Profile is locked after submission. Document uploads are disabled." });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      setSaving(true);
      const res = await fetchApi(`/api/v1/vendor/documents?document_type=${docType}`, {
        method: "POST",
        body: formData,
        headers: {}
      });
      if (res.ok) {
        const docData = await res.json();
        if (docType === "PRODUCT_CATALOG") {
          try {
            const versionId = docData.latest_version?.id || docData.version_id;
            if (versionId) {
              const catRes = await fetchApi("/api/v1/vendor/catalogs", {
                method: "POST",
                body: JSON.stringify({
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  document_version_id: versionId,
                  catalog_year: new Date().getFullYear().toString()
                })
              });
              if (catRes.ok) {
                const catalogData = await catRes.json();
                await fetchApi(`/api/v1/vendor/catalogs/${catalogData.id}/extract`, { method: "POST" });
                setMsg({ type: "success", text: "Product Catalog PDF uploaded & Gemini AI extraction started!" });
              }
            }
          } catch (e) {}
        } else {
          setMsg({ type: "success", text: `${docType.replace(/_/g, " ")} uploaded successfully!` });
        }
        const refreshed = await fetchApi("/api/v1/vendor/documents");
        if (refreshed.ok) setUploadedDocs(await refreshed.json());
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || err.detail || "Failed to upload document." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Upload error." });
    } finally {
      setSaving(false);
    }
  };

  const addProjectRow = () => {
    if (isLocked) return;
    setProjects([...projects, { hospital_name: "", bed_count: "", project_cost: "", financial_year: "", scope_of_work: "", is_300_plus_beds: false }]);
  };

  const updateProjectField = (index: number, field: string, value: any) => {
    if (isLocked) return;
    const next = [...projects];
    next[index][field] = value;
    setProjects(next);
  };

  const handleCategoryCheckbox = (cat: string) => {
    if (isLocked) return;
    if (supplyCategoriesList.includes(cat)) {
      setSupplyCategoriesList(supplyCategoriesList.filter(c => c !== cat));
    } else {
      setSupplyCategoriesList([...supplyCategoriesList, cat]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Loading Vendor Profile...</span>
        </div>
      </div>
    );
  }

  const completionPct = calculateCompletion();

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
                <Link href="/vendor/dashboard" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                  Dashboard
                </Link>
                <Link href="/vendor/profile" className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
                  My Profile (8 Sections)
                </Link>
                <Link href="/vendor/search" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
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

      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        
        {/* Left White Sidebar */}
        <aside className="w-full md:w-64 bg-white border border-gray-200 rounded-xl p-4 shrink-0 flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="px-2 border-b border-gray-100 pb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">8-Section Profile</span>
            </div>

            <div className="space-y-1 text-xs">
              {[
                { id: 1, name: "1. Identification", icon: "📑" },
                { id: 2, name: "2. Address & Contact", icon: "📍" },
                { id: 3, name: "3. Head of Organisation", icon: "👤" },
                { id: 4, name: "4. Bank Details", icon: "💳" },
                { id: 5, name: "5. Commercial Terms", icon: "💼" },
                { id: 6, name: "6. Classification", icon: "🏛️" },
                { id: 7, name: "7. Pre-Qualification", icon: "🛡️" },
                { id: 8, name: "8. Documents", icon: "📄" },
              ].map((s) => {
                const isComplete = getSectionStatus(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all ${
                      activeSection === s.id
                        ? "bg-blue-50 text-blue-600 border border-blue-200"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span>{s.icon}</span>
                      <span className="truncate">{s.name}</span>
                    </div>
                    {isComplete ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full ml-1 shrink-0">✓</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 bg-amber-50 font-bold px-1.5 py-0.5 rounded-full ml-1 shrink-0">Required</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => handleSaveProfile()}
              disabled={saving || isLocked}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isLocked ? "🔒" : "💾"}</span>
              <span>{isLocked ? "Profile Locked" : saving ? "Saving..." : "Save Profile Draft"}</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 space-y-6">
          
          {/* Dynamic Status Alert Banners */}
          {profile?.status === "APPROVED" && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center justify-between shadow-sm text-emerald-900">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h3 className="font-bold text-sm">Vendor Profile Verified & Approved</h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Your vendor organization has been verified and approved by JECRC Procurement Admin. Profile data is locked.
                  </p>
                </div>
              </div>
              <span className="bg-emerald-200 text-emerald-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
                APPROVED
              </span>
            </div>
          )}

          {profile?.status === "REJECTED" && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center justify-between shadow-sm text-red-900">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-sm">Vendor Profile Revision Required</h3>
                  <p className="text-xs text-red-800 mt-0.5">
                    Your profile requires revision or corrections. Please update the necessary sections/documents and re-submit.
                  </p>
                </div>
              </div>
              <span className="bg-red-200 text-red-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
                REJECTED
              </span>
            </div>
          )}

          {(profile?.status === "SUBMITTED" || profile?.status === "UNDER_REVIEW") && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center justify-between shadow-sm text-amber-900">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <h3 className="font-bold text-sm">Vendor Profile Under Review</h3>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Your profile has been submitted and is currently under review by JECRC Procurement Admin. Edits and updates are disabled.
                  </p>
                </div>
              </div>
              <span className="bg-amber-200 text-amber-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
                {profile?.status}
              </span>
            </div>
          )}

          {/* Header Banner */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vendor Master Profile</h1>
                <p className="text-xs text-gray-500 mt-1">Fill out your mandatory 8-section organization profile for verification</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-blue-600">{completionPct}%</span>
                <span className="text-[10px] text-gray-500 block font-semibold">Complete</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-3 border border-gray-200 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }}></div>
            </div>
          </div>

          {/* Notification Messages */}
          {msg && (
            <div className={`p-4 rounded-xl text-sm whitespace-pre-line flex items-start space-x-2 ${
              msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"
            }`}>
              <span className="text-base">{msg.type === "success" ? "✓" : "⚠️"}</span>
              <span className="font-medium text-xs md:text-sm">{msg.text}</span>
            </div>
          )}

          {/* SECTION 1: IDENTIFICATION */}
          {activeSection === 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 1: Vendor Identification</h2>
                <p className="text-xs text-gray-500">Basic company registration and identification details (* Mandatory)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendor Code</label>
                  <input type="text" disabled value={vendorCode} onChange={e => setVendorCode(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendor Status</label>
                  <input type="text" disabled value={profile?.status || "DRAFT"} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm font-bold uppercase disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Legal Name of Company <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={legalName} onChange={e => setLegalName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="ABC Medical Systems Pvt Ltd" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Display Name <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="ABC Medical Systems" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Short Name / Abbreviation</label>
                  <input type="text" disabled={isLocked} value={shortName} onChange={e => setShortName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="ABC" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendor Group</label>
                  <input type="text" disabled={isLocked} value={vendorGroup} onChange={e => setVendorGroup(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="OEM / Dealer / Distributor" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendor Type <span className="text-red-600 font-bold">*</span></label>
                  <select disabled={isLocked} value={vendorType} onChange={e => setVendorType(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Trader">Trader</option>
                    <option value="Service Provider">Service Provider</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendor Category <span className="text-red-600 font-bold">*</span></label>
                  <select disabled={isLocked} value={vendorCategory} onChange={e => setVendorCategory(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Medical Devices">Medical Devices</option>
                    <option value="Consumables">Consumables</option>
                    <option value="IT Hardware">IT Hardware</option>
                    <option value="Civil & Engineering">Civil & Engineering</option>
                    <option value="General Supplies">General Supplies</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">PAN Number <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={panNumber} onChange={e => setPanNumber(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500" placeholder="AABCA1234F" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">GST Number <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={gstin} onChange={e => setGstin(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500" placeholder="08AABCA1234F1Z8" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">GST Registration Type</label>
                  <select disabled={isLocked} value={gstRegistrationType} onChange={e => setGstRegistrationType(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Regular">Regular</option>
                    <option value="Composition">Composition</option>
                    <option value="SEZ">SEZ</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">MSME Registered</label>
                  <select disabled={isLocked} value={msmeRegistered ? "Yes" : "No"} onChange={e => setMsmeRegistered(e.target.value === "Yes")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">TDS Applicable</label>
                  <select disabled={isLocked} value={tdsApplicable ? "Yes" : "No"} onChange={e => setTdsApplicable(e.target.value === "Yes")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Other Regulatory Registrations</label>
                  <textarea disabled={isLocked} rows={2} value={otherRegulatoryRegistrations} onChange={e => setOtherRegulatoryRegistrations(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Drug License No., FSSAI, CIN, etc." />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: ADDRESS & CONTACT */}
          {activeSection === 2 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 2: Registered Address & Contact Details</h2>
                <p className="text-xs text-gray-500">Official company address and primary contact details (* Mandatory)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Registered Address Line 1 <span className="text-red-600 font-bold">*</span></label>
                  <textarea disabled={isLocked} rows={2} required value={addressLine1} onChange={e => setAddressLine1(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Plot No., Building Name, Street" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Address Line 2</label>
                  <textarea disabled={isLocked} rows={2} value={addressLine2} onChange={e => setAddressLine2(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Area, Locality (optional)" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Country</label>
                  <select disabled={isLocked} value={country} onChange={e => setCountry(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="India">India</option>
                    <option value="USA">USA</option>
                    <option value="Germany">Germany</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">State <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={stateProvince} onChange={e => setStateProvince(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Delhi / Rajasthan" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">City <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={city} onChange={e => setCity(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="New Delhi / Jaipur" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">PIN Code <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="6-digit PIN" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Primary Contact Person <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={primaryContactPerson} onChange={e => setPrimaryContactPerson(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Rajiv Menon" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Designation <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={contactDesignation} onChange={e => setContactDesignation(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="VP - Institutional Tenders" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Mobile Number <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="+91-9876543210" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Alternate Mobile</label>
                  <input type="text" disabled={isLocked} value={alternatePhone} onChange={e => setAlternatePhone(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Official Email <span className="text-red-600 font-bold">*</span></label>
                  <input type="email" disabled={isLocked} required value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="tenders@abcmedical.in" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Alternate Email</label>
                  <input type="email" disabled={isLocked} value={alternateEmail} onChange={e => setAlternateEmail(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Optional" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Website</label>
                  <input type="text" disabled={isLocked} value={website} onChange={e => setWebsite(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="https://www.yourcompany.com" />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: HEAD OF ORGANISATION */}
          {activeSection === 3 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 3: Head of Organisation Details</h2>
                <p className="text-xs text-gray-500">Details of the company's chief executive or owner (* Mandatory)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Name <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={headName} onChange={e => setHeadName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Dr. Alok Verma" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Designation <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={headDesignation} onChange={e => setHeadDesignation(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="Managing Director" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Email <span className="text-red-600 font-bold">*</span></label>
                  <input type="email" disabled={isLocked} required value={headEmail} onChange={e => setHeadEmail(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="head@company.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Phone <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={headPhone} onChange={e => setHeadPhone(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="+91 XXXXX XXXXX" />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: BANK DETAILS */}
          {activeSection === 4 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 4: Bank Details</h2>
                <p className="text-xs text-gray-500">Bank account details for payment processing (* Mandatory)</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs flex items-center space-x-2">
                <span>⚠️</span>
                <span>Please ensure bank details are accurate. Payments will be processed to this account. Upload a cancelled cheque in Section 8.</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Bank Name <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={bankName} onChange={e => setBankName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. State Bank of India" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Branch Name <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={branchName} onChange={e => setBranchName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. MI Road Branch, Jaipur" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Account Holder Name <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={accountName} onChange={e => setAccountName(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="As per bank records" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Account Number <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500" placeholder="Account number" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">IFSC Code <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={ifscCode} onChange={e => setIfscCode(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. SBIN0001234" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Account Type</label>
                  <select disabled={isLocked} value={accountType} onChange={e => setAccountType(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Current">Current</option>
                    <option value="Savings">Savings</option>
                    <option value="CC/OD">CC/OD</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: COMMERCIAL TERMS */}
          {activeSection === 5 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 5: Commercial Terms</h2>
                <p className="text-xs text-gray-500">Standard commercial terms and conditions</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Payment Terms</label>
                  <select disabled={isLocked} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Advance">Advance</option>
                    <option value="On Delivery">On Delivery</option>
                    <option value="Net 60 Days">Net 60 Days</option>
                    <option value="Net 90 Days">Net 90 Days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Credit Days</label>
                  <input type="number" disabled={isLocked} value={creditDays} onChange={e => setCreditDays(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Currency</label>
                  <select disabled={isLocked} value={currency} onChange={e => setCurrency(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Freight Terms</label>
                  <select disabled={isLocked} value={freightTerms} onChange={e => setFreightTerms(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="FOR Destination / Free Delivery">FOR Destination / Free Delivery</option>
                    <option value="Ex-Works">Ex-Works</option>
                    <option value="Freight Extra">Freight Extra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Delivery Terms</label>
                  <select disabled={isLocked} value={deliveryTerms} onChange={e => setDeliveryTerms(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Door Delivery">Door Delivery</option>
                    <option value="Warehouse Pick-up">Warehouse Pick-up</option>
                    <option value="Site Delivery">Site Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Price List Applicable</label>
                  <select disabled={isLocked} value={priceListApplicable} onChange={e => setPriceListApplicable(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Standard Institutional">Standard Institutional</option>
                    <option value="MRP Based">MRP Based</option>
                    <option value="Custom Rate List">Custom Rate List</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Rate Contract Applicable</label>
                  <select disabled={isLocked} value={rateContractApplicable ? "Yes" : "No"} onChange={e => setRateContractApplicable(e.target.value === "Yes")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: CLASSIFICATION */}
          {activeSection === 6 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 6: Vendor Classification</h2>
                <p className="text-xs text-gray-500">Categorise your business for procurement routing</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Supply Category</label>
                  <select disabled={isLocked} value={supplyCategory} onChange={e => setSupplyCategory(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Equipment & Infrastructure">Equipment & Infrastructure</option>
                    <option value="Consumables">Consumables</option>
                    <option value="IT Hardware">IT Hardware</option>
                    <option value="Civil & Engineering">Civil & Engineering</option>
                    <option value="Services & AMC">Services & AMC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Product / Service Type</label>
                  <select disabled={isLocked} value={productServiceType} onChange={e => setProductServiceType(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Supply & Installation">Supply & Installation</option>
                    <option value="Supply Only">Supply Only</option>
                    <option value="Turnkey Project">Turnkey Project</option>
                    <option value="Maintenance & AMC">Maintenance & AMC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Geographic Reach</label>
                  <select disabled={isLocked} value={geographicalCoverage} onChange={e => setGeographicalCoverage(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="National">National</option>
                    <option value="Regional">Regional</option>
                    <option value="State-level">State-level</option>
                    <option value="Local - Jaipur">Local - Jaipur</option>
                    <option value="International">International</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Primary Business Type</label>
                  <select disabled={isLocked} value={primaryBusinessType} onChange={e => setPrimaryBusinessType(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="Private Limited Company">Private Limited Company</option>
                    <option value="Public Limited Company">Public Limited Company</option>
                    <option value="Proprietorship">Proprietorship</option>
                    <option value="Partnership">Partnership</option>
                    <option value="LLP">LLP</option>
                  </select>
                </div>

                <div className="md:col-span-2 pt-3 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-3">Supply Categories (Select All Applicable)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      "Pharmacy / Drugs", "Medical Consumables", "Surgical Items",
                      "Laboratory Equipment", "Medical Equipment", "Engineering / Civil",
                      "Services / AMC", "General Supplies"
                    ].map(cat => (
                      <label key={cat} className="flex items-center space-x-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100">
                        <input
                          type="checkbox"
                          disabled={isLocked}
                          checked={supplyCategoriesList.includes(cat)}
                          onChange={() => handleCategoryCheckbox(cat)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <span className="text-xs font-medium text-gray-800">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 7: PRE-QUALIFICATION */}
          {activeSection === 7 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 7: Pre-Qualification & Declarations</h2>
                <p className="text-xs text-gray-500">Experience, turnover, and legal declarations (* Mandatory)</p>
              </div>

              <div className="space-y-6 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Annual Turnover (INR Crores)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">FY 2023-24</span>
                      <input type="number" disabled={isLocked} step="0.01" value={turnoverFy1} onChange={e => setTurnoverFy1(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="0.00" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">FY 2024-25</span>
                      <input type="number" disabled={isLocked} step="0.01" value={turnoverFy2} onChange={e => setTurnoverFy2(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="0.00" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">FY 2025-26</span>
                      <input type="number" disabled={isLocked} step="0.01" value={turnoverFy3} onChange={e => setTurnoverFy3(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="0.00" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Years in Business</label>
                    <input type="number" disabled={isLocked} value={yearsInBusiness} onChange={e => setYearsInBusiness(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="14" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Projects Completed</label>
                    <input type="number" disabled={isLocked} value={projectsCompletedCount} onChange={e => setProjectsCompletedCount(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="28" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">High-Value Projects &gt; ₹1CR</label>
                    <input type="number" disabled={isLocked} value={highValueProjectsCount} onChange={e => setHighValueProjectsCount(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. 3" />
                  </div>
                </div>

                {/* Projects Table */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-gray-600 uppercase">Projects in Last 3 Years (Institutions &gt; 300 Beds)</label>
                    {!isLocked && (
                      <button type="button" onClick={addProjectRow} className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-1">
                        <span>+ Add Row</span>
                      </button>
                    )}
                  </div>

                  {projects.map((proj, idx) => (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Hospital / Institution Name</span>
                          <input type="text" disabled={isLocked} value={proj.hospital_name || ""} onChange={e => updateProjectField(idx, "hospital_name", e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-500" placeholder="Hospital Name" />
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Bed Count</span>
                          <input type="number" disabled={isLocked} value={proj.bed_count || ""} onChange={e => updateProjectField(idx, "bed_count", e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. 350" />
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Project Cost (₹ Cr)</span>
                          <input type="number" disabled={isLocked} step="0.01" value={proj.project_cost || ""} onChange={e => updateProjectField(idx, "project_cost", e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. 2.5" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" disabled={isLocked} checked={hasServiceBaseJaipur} onChange={e => setHasServiceBaseJaipur(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                    <span className="text-xs font-semibold text-blue-900">We have a service base in Jaipur / Rajasthan</span>
                  </label>
                </div>

                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <span className="text-xs font-semibold text-gray-600 uppercase block">Legal Declarations</span>
                  
                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input type="checkbox" disabled={isLocked} checked={isBlacklisted} onChange={e => setIsBlacklisted(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50" />
                    <span className="text-xs text-gray-700">Our company has been blacklisted by any government institution or PSU</span>
                  </label>

                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input type="checkbox" disabled={isLocked} checked={pendingLitigation} onChange={e => setPendingLitigation(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50" />
                    <span className="text-xs text-gray-700">Our company has pending litigation with any government body</span>
                  </label>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <label className="flex items-start space-x-2 cursor-pointer">
                      <input type="checkbox" disabled={isLocked} checked={notDebarredDeclaration} onChange={e => setNotDebarredDeclaration(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50" />
                      <span className="text-xs text-emerald-800 font-semibold">
                        I/We hereby declare that our firm has not been debarred, blacklisted, or disqualified from participating in any procurement process by JECRC Foundation or any government/institutional body. <span className="text-red-600 font-bold">*</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 8: DOCUMENTS */}
          {activeSection === 8 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 8: Supporting Compliance Documents</h2>
                <p className="text-xs text-gray-500">Upload required compliance certificates and supporting documents (* Mandatory)</p>
              </div>

              <div className="space-y-3">
                {[
                  { key: "PAN", label: "PAN Card Copy", required: true },
                  { key: "GST", label: "GST Registration Certificate", required: true },
                  { key: "CANCELLED_CHEQUE", label: "Cancelled Cheque / Bank Letter", required: true },
                  { key: "BALANCE_SHEET", label: "Audited Balance Sheet FY 2024-25", required: true },
                  { key: "NON_DEBARMENT_DECLARATION", label: "Non-Debarment Declaration", required: true },
                  { key: "MSME", label: "MSME/Udyam Certificate", required: false },
                  { key: "COMPANY_PROFILE", label: "Company Profile / Brochure", required: false },
                  { key: "PRODUCT_CATALOG", label: "Product Catalog PDF (AI Product Extraction)", required: false },
                  { key: "DRUG_LICENSE", label: "Drug License (if applicable)", required: false },
                  { key: "OTHER", label: "Other Supporting Document", required: false }
                ].map((doc) => {
                  const uploaded = uploadedDocs.find(d => d.document_type === doc.key);
                  return (
                    <div key={doc.key} className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900 text-xs">{doc.label}</span>
                          {doc.required && (
                            <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Required *
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-500 block mt-0.5">
                          {uploaded ? `✓ Uploaded (${uploaded.latest_version?.original_filename || "File attached"})` : "No file uploaded"}
                        </span>
                      </div>
                      <div>
                        <input
                          type="file"
                          disabled={isLocked}
                          accept=".pdf,.png,.jpg,.jpeg"
                          id={`file-${doc.key}`}
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              handleDocumentUpload(doc.key, e.target.files[0]);
                            }
                          }}
                        />
                        <label
                          htmlFor={`file-${doc.key}`}
                          className={`px-3.5 py-1.5 font-semibold rounded-lg border text-xs inline-flex items-center space-x-1.5 transition-all shadow-sm ${
                            isLocked
                              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 cursor-pointer"
                          }`}
                        >
                          <span>⬆ {uploaded ? "Replace File" : "Upload File"}</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Form Navigation Buttons */}
          <div className="flex justify-between items-center border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setActiveSection(Math.max(1, activeSection - 1))}
              disabled={activeSection === 1}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-300 text-xs disabled:opacity-40 transition-all shadow-sm"
            >
              ← Previous Section
            </button>

            <div className="space-x-2">
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => handleSaveProfile(false)}
                  disabled={saving}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-300 text-xs transition-all shadow-sm"
                >
                  {saving ? "Saving..." : "Save Draft"}
                </button>
              )}

              {activeSection < 8 ? (
                <button
                  type="button"
                  onClick={() => setActiveSection(activeSection + 1)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
                >
                  Next Section →
                </button>
              ) : !isLocked ? (
                <button
                  type="button"
                  onClick={() => handleSaveProfile(true)}
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all font-bold"
                >
                  Submit Complete Profile
                </button>
              ) : (
                <span className="px-4 py-2 bg-amber-100 text-amber-800 font-bold rounded-lg text-xs border border-amber-300">
                  🔒 Locked ({profile?.status})
                </span>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
