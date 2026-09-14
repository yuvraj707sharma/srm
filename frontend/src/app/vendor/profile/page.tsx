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
  const [turnoverFy1, setTurnoverFy1] = useState<number | "">(""); // FY 2025-26
  const [turnoverFy2, setTurnoverFy2] = useState<number | "">(""); // FY 2024-25
  const [turnoverFy3, setTurnoverFy3] = useState<number | "">(""); // FY 2023-24
  const [yearsInBusiness, setYearsInBusiness] = useState<number | "">(14);
  const [projectsCompletedCount, setProjectsCompletedCount] = useState<number | "">(28);
  const [highValueProjectsCount, setHighValueProjectsCount] = useState<number | "">("");
  const [highValueProjectsThresholdCr, setHighValueProjectsThresholdCr] = useState<number | "">(1.0);
  const [hasServiceBaseJaipur, setHasServiceBaseJaipur] = useState(false);
  const [infrastructureBaseDetails, setInfrastructureBaseDetails] = useState("");
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [pendingLitigation, setPendingLitigation] = useState(false);
  const [notDebarredDeclaration, setNotDebarredDeclaration] = useState(true);

  // Dynamic Projects Table (Institutions > 300 Beds)
  const [projects, setProjects] = useState<any[]>([
    { hospital_name: "", bed_count: 350, project_cost: "", project_duration: "", financial_year: "FY 2024-25", scope_of_work: "", is_300_plus_beds: true }
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
        if (data.high_value_projects_threshold_cr !== undefined && data.high_value_projects_threshold_cr !== null) {
          setHighValueProjectsThresholdCr(data.high_value_projects_threshold_cr);
        }
        setHasServiceBaseJaipur(data.has_service_base_jaipur || false);
        setIsBlacklisted(data.is_blacklisted || false);
        setPendingLitigation(data.pending_litigation || false);
        setNotDebarredDeclaration(data.not_debarred_declaration ?? true);

        if (data.financials) {
          setTurnoverFy1(data.financials.turnover_fy1 ?? "");
          setTurnoverFy2(data.financials.turnover_fy2 ?? "");
          setTurnoverFy3(data.financials.turnover_fy3 ?? "");
          setInfrastructureBaseDetails(data.financials.infrastructure_base_details || "");
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
    const uploadedTypes = uploadedDocs.map(d => d.document_type);
    switch (sectionId) {
      case 1: // Identification & Tax Docs
        return Boolean(legalName && panNumber && gstin && uploadedTypes.includes("PAN") && uploadedTypes.includes("GST"));
      case 2: // Address & Contact
        return Boolean(addressLine1 && city && stateProvince && postalCode && primaryContactPerson && primaryPhone && primaryEmail);
      case 3: // Head of Org
        return Boolean(headName && headEmail && headPhone);
      case 4: // Bank Details & Cheque
        return Boolean(bankName && accountNumber && ifscCode && uploadedTypes.includes("CANCELLED_CHEQUE"));
      case 5: // Commercial Terms
        return Boolean(paymentTerms && currency);
      case 6: // Classification
        return Boolean(supplyCategory && productServiceType && primaryBusinessType);
      case 7: // Pre-Qualification, Turnover & Balance Sheet
        return Boolean(
          turnoverFy2 !== "" &&
          yearsInBusiness !== "" &&
          projectsCompletedCount !== "" &&
          notDebarredDeclaration &&
          uploadedTypes.includes("BALANCE_SHEET") &&
          uploadedTypes.includes("NON_DEBARMENT_DECLARATION")
        );
      case 8: // Documents Overview & Supplementary
        return true;
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
    const uploadedTypes = uploadedDocs.map(d => d.document_type);

    if (!legalName.trim()) missing.push({ section: 1, item: "Legal Name of Company" });
    if (!panNumber.trim()) missing.push({ section: 1, item: "PAN Number" });
    if (!uploadedTypes.includes("PAN")) missing.push({ section: 1, item: "PAN Card Document Upload (Section 1)" });
    if (!gstin.trim()) missing.push({ section: 1, item: "GST Number" });
    if (!uploadedTypes.includes("GST")) missing.push({ section: 1, item: "GST Certificate Document Upload (Section 1)" });

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
    if (!uploadedTypes.includes("CANCELLED_CHEQUE")) missing.push({ section: 4, item: "Cancelled Cheque / Bank Letter Upload (Section 4)" });

    if (turnoverFy2 === "") missing.push({ section: 7, item: "FY 2024-25 Turnover" });
    if (!uploadedTypes.includes("BALANCE_SHEET")) missing.push({ section: 7, item: "Audited Balance Sheet FY 2024-25 Upload (Section 7)" });
    if (!notDebarredDeclaration) missing.push({ section: 7, item: "Non-Debarment Declaration Checkbox" });
    if (!uploadedTypes.includes("NON_DEBARMENT_DECLARATION")) missing.push({ section: 7, item: "Signed Non-Debarment Declaration Upload (Section 7)" });

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
          high_value_projects_threshold_cr: highValueProjectsThresholdCr === "" ? null : Number(highValueProjectsThresholdCr),
          has_service_base_jaipur: hasServiceBaseJaipur,
          is_blacklisted: isBlacklisted,
          pending_litigation: pendingLitigation,
          not_debarred_declaration: notDebarredDeclaration,

          financials: {
            turnover_fy1: turnoverFy1 === "" ? null : turnoverFy1,
            turnover_fy2: turnoverFy2 === "" ? null : turnoverFy2,
            turnover_fy3: turnoverFy3 === "" ? null : turnoverFy3,
            infrastructure_base_details: infrastructureBaseDetails,
          },

          projects: projects
            .filter(p => p.hospital_name && p.hospital_name.trim().length > 0)
            .map(p => ({
              hospital_name: p.hospital_name.trim(),
              bed_count: p.bed_count === "" ? null : Number(p.bed_count),
              is_300_plus_beds: Number(p.bed_count) >= 300,
              project_cost: p.project_cost === "" ? null : Number(p.project_cost),
              project_duration: p.project_duration || null,
              financial_year: p.financial_year || "FY 2024-25",
              scope_of_work: p.scope_of_work || null
            }))
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
    setProjects([
      ...projects,
      { hospital_name: "", bed_count: 350, project_cost: "", project_duration: "12 Months", financial_year: "FY 2024-25", scope_of_work: "", is_300_plus_beds: true }
    ]);
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

  const InlineDocUploader = ({
    docType,
    label,
    required = false,
    description,
  }: {
    docType: string;
    label: string;
    required?: boolean;
    description?: string;
  }) => {
    const uploaded = uploadedDocs.find(d => d.document_type === docType);
    const fileInputId = `inline-doc-${docType}`;

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-900 text-xs">{label}</span>
            {required && (
              <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Required *
              </span>
            )}
          </div>
          {description && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{description}</p>}
          <div className="mt-1.5 flex items-center space-x-2 text-xs">
            {uploaded ? (
              <span className="inline-flex items-center space-x-1.5 text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md text-[11px]">
                <span>✓ Uploaded:</span>
                <span className="font-mono truncate max-w-[200px] sm:max-w-xs">{uploaded.latest_version?.original_filename || "File attached"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 text-amber-700 text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                <span>⚠️ Pending Upload</span>
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center">
          <input
            type="file"
            id={fileInputId}
            disabled={isLocked}
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={e => {
              if (e.target.files && e.target.files[0]) {
                handleDocumentUpload(docType, e.target.files[0]);
              }
            }}
          />
          <label
            htmlFor={fileInputId}
            className={`px-3.5 py-1.5 font-semibold rounded-lg border text-xs inline-flex items-center space-x-1.5 transition-all shadow-xs ${
              isLocked
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : uploaded
                ? "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 cursor-pointer"
                : "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 cursor-pointer"
            }`}
          >
            <span>{uploaded ? "↻ Replace File" : "⬆ Upload Document"}</span>
          </label>
        </div>
      </div>
    );
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

          {/* Empanelment Email Pre-Qualification Requirements Callout */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border border-blue-200/90 rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="text-xl">📧</span>
              <div className="text-xs space-y-1.5">
                <div className="font-bold text-blue-950 text-sm flex items-center gap-2">
                  <span>Empanelment Notice — 5 Pre-Qualification Evaluation Points</span>
                  <span className="bg-blue-600 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">Email Instructions</span>
                </div>
                <p className="text-blue-800 leading-relaxed">
                  Please ensure your profile accurately answers the 5 criteria sent to your email. The Procurement Committee evaluates and scores these exact items to determine vendor empanelment and select the best vendor:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-blue-950 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-600 font-bold">1.</span>
                    <span>Hospital Projects &gt;300 Beds (Last 3 Years) → <em>Filled in Section 7</em></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-600 font-bold">2.</span>
                    <span>Company 3-Year Turnover (FY 23-24 to 25-26) → <em>Filled in Section 7</em></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-600 font-bold">3.</span>
                    <span>High-Value Projects Delivered (&gt; ₹1.0 Cr) → <em>Filled in Section 7</em></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-600 font-bold">4.</span>
                    <span>Service Base in Jaipur / Rajasthan → <em>Filled in Section 7</em></span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:col-span-2">
                    <span className="text-blue-600 font-bold">5.</span>
                    <span>Audited Balance Sheet for FY 2024-25 (with CA seal) → <em>Uploaded directly in Section 7 &amp; 8</em></span>
                  </div>
                </div>
              </div>
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
                  <input type="text" disabled={isLocked} required value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500 mb-2" placeholder="AABCA1234F" />
                  <InlineDocUploader docType="PAN" label="PAN Card Document Copy" required={true} description="Upload self-attested PAN card scan (PDF/Image)" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">GST Number <span className="text-red-600 font-bold">*</span></label>
                  <input type="text" disabled={isLocked} required value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500 mb-2" placeholder="08AABCA1234F1Z8" />
                  <InlineDocUploader docType="GST" label="GST Registration Certificate" required={true} description="Upload official GST REG-06 registration certificate (PDF)" />
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
                  <select disabled={isLocked} value={msmeRegistered ? "Yes" : "No"} onChange={e => setMsmeRegistered(e.target.value === "Yes")} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 mb-2">
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                  {msmeRegistered && (
                    <InlineDocUploader docType="MSME" label="MSME / Udyam Certificate" required={false} description="Upload valid Udyam Registration Certificate (PDF)" />
                  )}
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

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 text-xs flex items-center space-x-2">
                <span>ℹ️</span>
                <span>Please ensure bank details are accurate. Purchase order remittances and vendor payments will be processed directly to this account.</span>
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
                  <input type="text" disabled={isLocked} required value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())} className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. SBIN0001234" />
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

              <div className="border-t border-gray-100 pt-4">
                <InlineDocUploader
                  docType="CANCELLED_CHEQUE"
                  label="Cancelled Cheque / Bank Letter"
                  required={true}
                  description="Upload scanned copy or clear image of cancelled cheque showing account number and IFSC, or official bank verification letter"
                />
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
                <h2 className="text-base font-bold text-gray-900">Section 7: Pre-Qualification, Turnover & Experience</h2>
                <p className="text-xs text-gray-500">Provide company financials, healthcare project history, infrastructure base, and compliance declarations (* Mandatory)</p>
              </div>

              <div className="space-y-6 text-sm">
                {/* REQUIREMENT 2 & 5: TURNOVER (LAST 3 YEARS) & AUDITED BALANCE SHEET FOR FY 2024-25 */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center space-x-2">
                        <span>📊</span>
                        <span>2. Turnover of the Company in the last 3 years (FY 2025-26, FY 2024-25 and FY 2023-24)</span>
                        <span className="text-red-600 font-bold">*</span>
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Enter annual turnover in INR Crores for each financial year.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="text-xs font-bold text-gray-700 block mb-1">FY 2025-26 (Projected / Actual)</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-gray-500 font-bold">₹</span>
                        <input
                          type="number"
                          disabled={isLocked}
                          step="0.01"
                          value={turnoverFy1}
                          onChange={e => setTurnoverFy1(e.target.value ? Number(e.target.value) : "")}
                          className="w-full bg-white border border-gray-300 rounded-lg pl-7 pr-12 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 font-medium"
                          placeholder="0.00"
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 font-semibold">Cr</span>
                      </div>
                    </div>

                    <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                      <span className="text-xs font-bold text-blue-900 block mb-1">FY 2024-25 (Audited) <span className="text-red-600 font-bold">*</span></span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-gray-500 font-bold">₹</span>
                        <input
                          type="number"
                          disabled={isLocked}
                          step="0.01"
                          required
                          value={turnoverFy2}
                          onChange={e => setTurnoverFy2(e.target.value ? Number(e.target.value) : "")}
                          className="w-full bg-white border border-blue-300 rounded-lg pl-7 pr-12 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 font-bold"
                          placeholder="0.00"
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 font-semibold">Cr</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="text-xs font-bold text-gray-700 block mb-1">FY 2023-24 (Audited)</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-gray-500 font-bold">₹</span>
                        <input
                          type="number"
                          disabled={isLocked}
                          step="0.01"
                          value={turnoverFy3}
                          onChange={e => setTurnoverFy3(e.target.value ? Number(e.target.value) : "")}
                          className="w-full bg-white border border-gray-300 rounded-lg pl-7 pr-12 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 font-medium"
                          placeholder="0.00"
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 font-semibold">Cr</span>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 5: AUDITED BALANCE SHEET FOR FY 2024-25 (INLINE UPLOAD) */}
                  <div className="pt-2 border-t border-gray-100">
                    <InlineDocUploader
                      docType="BALANCE_SHEET"
                      label="5. Audited Balance Sheet for FY 2024-25"
                      required={true}
                      description="Upload complete Audited Balance Sheet & Profit and Loss (P&L) statement for FY 2024-25 certified by a Chartered Accountant with UDIN (PDF)"
                    />
                  </div>
                </div>

                {/* REQUIREMENT 3: NUMBER OF PROJECTS DELIVERED WITH PROJECT COST > RS. ... CRORE */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-base">💼</span>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      3. Number of Projects delivered with Project Cost of more than Rs. ...... Crore
                    </h3>
                  </div>
                  <p className="text-[11px] text-gray-500">Specify your benchmark project cost threshold in Rs. Crore and indicate the total number of qualifying projects delivered.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 block mb-1">Project Cost Threshold (in Rs. Crore)</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-gray-500 font-bold">₹</span>
                        <input
                          type="number"
                          disabled={isLocked}
                          step="0.1"
                          value={highValueProjectsThresholdCr}
                          onChange={e => setHighValueProjectsThresholdCr(e.target.value ? Number(e.target.value) : "")}
                          className="w-full bg-white border border-gray-300 rounded-lg pl-7 pr-12 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 font-medium"
                          placeholder="1.0"
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 font-semibold">Cr</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-gray-700 block mb-1">
                        Total Qualifying Projects Delivered (&gt; ₹{highValueProjectsThresholdCr || "1.0"} Cr)
                      </span>
                      <input
                        type="number"
                        disabled={isLocked}
                        value={highValueProjectsCount}
                        onChange={e => setHighValueProjectsCount(e.target.value ? Number(e.target.value) : "")}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 font-bold"
                        placeholder="e.g. 5"
                      />
                    </div>
                  </div>
                </div>

                {/* REQUIREMENT 4: INFRASTRUCTURE / SERVICE BASE AT JAIPUR AND/OR RAJASTHAN */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-base">🏢</span>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      4. Infrastructure / Service base at Jaipur and / or Rajasthan
                    </h3>
                  </div>

                  <div className="flex items-center space-x-6 pt-1">
                    <label className="inline-flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="hasServiceBaseJaipur"
                        disabled={isLocked}
                        checked={hasServiceBaseJaipur === true}
                        onChange={() => setHasServiceBaseJaipur(true)}
                        className="text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="text-xs font-semibold text-gray-800">Yes, Available in Jaipur / Rajasthan</span>
                    </label>
                    <label className="inline-flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="hasServiceBaseJaipur"
                        disabled={isLocked}
                        checked={hasServiceBaseJaipur === false}
                        onChange={() => setHasServiceBaseJaipur(false)}
                        className="text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="text-xs font-semibold text-gray-800">No Local Service Base in Rajasthan</span>
                    </label>
                  </div>

                  {hasServiceBaseJaipur && (
                    <div className="mt-2 pt-3 border-t border-gray-100 space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        Infrastructure & Service Base Address / Facility Details in Jaipur / Rajasthan <span className="text-red-600 font-bold">*</span>
                      </label>
                      <textarea
                        rows={3}
                        disabled={isLocked}
                        value={infrastructureBaseDetails}
                        onChange={e => setInfrastructureBaseDetails(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                        placeholder="Specify office address in Jaipur / Rajasthan, service center / warehouse facility, resident bio-medical / service engineers count, and standard breakdown response turnaround time..."
                      />
                    </div>
                  )}
                </div>

                {/* REQUIREMENT 1: PROJECTS IN HOSPITALS WITH >300 BEDS IN LAST 3 YEARS */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <div>
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center space-x-2">
                        <span>🏥</span>
                        <span>1. Projects delivered in the last 3 years in Hospitals with more than 300 Beds (FY 2025-26, FY 2024-25 and FY 2023-24)</span>
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Provide project delivery records in Medical Colleges & Hospitals (&gt; 300 Beds) with Hospital Name, Project Cost, and Project Duration.
                      </p>
                    </div>

                    {!isLocked && (
                      <button
                        type="button"
                        onClick={addProjectRow}
                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors self-start sm:self-auto shrink-0"
                      >
                        <span>+ Add Hospital Project</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 block mb-1">
                        Total Number of Hospital Projects (&gt;300 Beds) Delivered
                      </span>
                      <input
                        type="number"
                        disabled={isLocked}
                        value={projectsCompletedCount}
                        onChange={e => setProjectsCompletedCount(e.target.value ? Number(e.target.value) : "")}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-bold"
                        placeholder="e.g. 8"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-700 block mb-1">Years of Relevant Healthcare / Industrial Experience</span>
                      <input
                        type="number"
                        disabled={isLocked}
                        value={yearsInBusiness}
                        onChange={e => setYearsInBusiness(e.target.value ? Number(e.target.value) : "")}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-bold"
                        placeholder="e.g. 14"
                      />
                    </div>
                  </div>

                  {/* Projects List */}
                  <div className="space-y-3">
                    {projects.map((proj, idx) => (
                      <div key={idx} className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 space-y-3 relative hover:border-blue-200 transition-all shadow-xs">
                        <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                          <span className="text-xs font-bold text-gray-700 flex items-center space-x-2">
                            <span className="bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">Project #{idx + 1}</span>
                            <span>Hospital / Medical College Details</span>
                          </span>

                          {!isLocked && projects.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = projects.filter((_, i) => i !== idx);
                                setProjects(next);
                              }}
                              className="text-xs text-red-500 hover:text-red-700 font-semibold"
                            >
                              ✕ Remove Row
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          <div className="md:col-span-2">
                            <span className="font-semibold text-gray-600 block mb-1">Name of Medical College / Hospital <span className="text-red-600 font-bold">*</span></span>
                            <input
                              type="text"
                              disabled={isLocked}
                              value={proj.hospital_name || ""}
                              onChange={e => updateProjectField(idx, "hospital_name", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                              placeholder="e.g. SMS Medical College & Hospital, Jaipur / AIIMS"
                            />
                          </div>

                          <div>
                            <span className="font-semibold text-gray-600 block mb-1">Bed Count (&gt; 300 Beds) <span className="text-red-600 font-bold">*</span></span>
                            <input
                              type="number"
                              disabled={isLocked}
                              value={proj.bed_count || ""}
                              onChange={e => updateProjectField(idx, "bed_count", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-medium"
                              placeholder="e.g. 500"
                            />
                          </div>

                          <div>
                            <span className="font-semibold text-gray-600 block mb-1">Financial Year Delivered <span className="text-red-600 font-bold">*</span></span>
                            <select
                              disabled={isLocked}
                              value={proj.financial_year || "FY 2024-25"}
                              onChange={e => updateProjectField(idx, "financial_year", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-medium"
                            >
                              <option value="FY 2025-26">FY 2025-26</option>
                              <option value="FY 2024-25">FY 2024-25</option>
                              <option value="FY 2023-24">FY 2023-24</option>
                            </select>
                          </div>

                          <div>
                            <span className="font-semibold text-gray-600 block mb-1">Project Cost (₹ in Crores) <span className="text-red-600 font-bold">*</span></span>
                            <input
                              type="number"
                              step="0.01"
                              disabled={isLocked}
                              value={proj.project_cost || ""}
                              onChange={e => updateProjectField(idx, "project_cost", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 font-bold"
                              placeholder="e.g. 3.50"
                            />
                          </div>

                          <div>
                            <span className="font-semibold text-gray-600 block mb-1">Project Duration <span className="text-red-600 font-bold">*</span></span>
                            <input
                              type="text"
                              disabled={isLocked}
                              value={proj.project_duration || ""}
                              onChange={e => updateProjectField(idx, "project_duration", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                              placeholder="e.g. 12 Months / Apr 2024 - Mar 2025"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <span className="font-semibold text-gray-600 block mb-1">Scope of Work / Supplies Delivered</span>
                            <input
                              type="text"
                              disabled={isLocked}
                              value={proj.scope_of_work || ""}
                              onChange={e => updateProjectField(idx, "scope_of_work", e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                              placeholder="e.g. Supply, installation, testing and commissioning of medical gas pipeline system & ICU ventilators"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* LEGAL & DEBARMENT DECLARATIONS WITH INLINE UPLOAD */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Legal & Debarment Declarations</span>
                  
                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input type="checkbox" disabled={isLocked} checked={isBlacklisted} onChange={e => setIsBlacklisted(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50" />
                    <span className="text-xs text-gray-700">Our company has been blacklisted by any government institution, state authority, or PSU</span>
                  </label>

                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input type="checkbox" disabled={isLocked} checked={pendingLitigation} onChange={e => setPendingLitigation(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50" />
                    <span className="text-xs text-gray-700">Our company has active or pending litigation with any government or healthcare body</span>
                  </label>

                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <label className="flex items-start space-x-2.5 cursor-pointer">
                      <input type="checkbox" disabled={isLocked} checked={notDebarredDeclaration} onChange={e => setNotDebarredDeclaration(e.target.checked)} className="mt-1 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50" />
                      <span className="text-xs text-emerald-900 font-semibold leading-relaxed">
                        I/We hereby solemnly declare that our firm / company has NOT been debarred, blacklisted, or disqualified from participating in any procurement process by JECRC Foundation or any government/institutional body. <span className="text-red-600 font-bold">*</span>
                      </span>
                    </label>

                    <div className="pt-2 border-t border-emerald-200">
                      <InlineDocUploader
                        docType="NON_DEBARMENT_DECLARATION"
                        label="Signed Non-Debarment Declaration / Affidavit"
                        required={true}
                        description="Upload signed and stamped Non-Debarment Affidavit or Declaration on company letterhead (PDF)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 8: DOCUMENTS OVERVIEW & SUPPLEMENTARY FILES */}
          {activeSection === 8 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">Section 8: Compliance Verification & Supplementary Documents</h2>
                <p className="text-xs text-gray-500">
                  Mandatory compliance documents are uploaded directly within their respective sections. Use this section to review compliance status and attach additional catalog or quality documents.
                </p>
              </div>

              {/* CARD 1: OVERVIEW OF INLINE COMPLIANCE DOCUMENTS */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-base">📋</span>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Mandatory Compliance Documents Summary
                    </h3>
                  </div>
                  <span className="text-[11px] text-gray-500">Uploaded in Sections 1, 4 & 7</span>
                </div>

                <div className="divide-y divide-gray-200 text-xs">
                  {[
                    { key: "PAN", label: "PAN Card Document Copy", sectionId: 1, sectionName: "Section 1 (Identification)" },
                    { key: "GST", label: "GST Registration Certificate", sectionId: 1, sectionName: "Section 1 (Identification)" },
                    { key: "CANCELLED_CHEQUE", label: "Cancelled Cheque / Bank Letter", sectionId: 4, sectionName: "Section 4 (Bank Details)" },
                    { key: "BALANCE_SHEET", label: "Audited Balance Sheet FY 2024-25", sectionId: 7, sectionName: "Section 7 (Pre-Qualification)" },
                    { key: "NON_DEBARMENT_DECLARATION", label: "Signed Non-Debarment Declaration", sectionId: 7, sectionName: "Section 7 (Pre-Qualification)" },
                    ...(msmeRegistered ? [{ key: "MSME", label: "MSME / Udyam Certificate", sectionId: 1, sectionName: "Section 1 (Identification)" }] : [])
                  ].map(doc => {
                    const uploaded = uploadedDocs.find(d => d.document_type === doc.key);
                    return (
                      <div key={doc.key} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900">{doc.label}</span>
                            <span className="text-[10px] text-gray-500 bg-gray-200/70 px-1.5 py-0.2 rounded font-medium">{doc.sectionName}</span>
                          </div>
                          <span className="text-[11px] block mt-0.5">
                            {uploaded ? (
                              <span className="text-emerald-700 font-medium">✓ Uploaded ({uploaded.latest_version?.original_filename || "Attached"})</span>
                            ) : (
                              <span className="text-amber-700 font-medium">⚠️ Pending upload in {doc.sectionName}</span>
                            )}
                          </span>
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => setActiveSection(doc.sectionId)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold underline bg-white border border-gray-200 hover:border-blue-300 px-3 py-1 rounded-md shadow-2xs transition-all"
                          >
                            {uploaded ? "View / Replace in " + doc.sectionName.split(" ")[0] : "Go to " + doc.sectionName.split(" ")[0]}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CARD 2: SUPPLEMENTARY / ADDITIONAL DOCUMENTS */}
              <div className="space-y-4 pt-2">
                <div className="border-b border-gray-100 pb-2">
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center space-x-2">
                    <span>📁</span>
                    <span>Supplementary & Technical Documents (Optional / As Applicable)</span>
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Upload your official company profile, product catalogs for AI-assisted pricing extraction, and regulatory licenses.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { key: "COMPANY_PROFILE", label: "Company Profile / Brochure", desc: "Corporate presentation, client list, and executive overview (PDF)" },
                    { key: "PRODUCT_CATALOG", label: "Product Catalog PDF (AI Extraction)", desc: "Upload detailed technical item catalog for automatic Gemini AI extraction" },
                    { key: "DRUG_LICENSE", label: "Drug License / FDA Permissions", desc: "Form 20B/21B or state FDA manufacture/wholesale licenses (if applicable)" },
                    { key: "OTHER", label: "Other Accreditations / Certifications", desc: "ISO 9001/13485, CE, BIS, or specialized hospital OEM certifications" }
                  ].map(doc => {
                    const uploaded = uploadedDocs.find(d => d.document_type === doc.key);
                    return (
                      <div key={doc.key} className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold text-gray-900 text-xs">{doc.label}</span>
                          <p className="text-[11px] text-gray-500 mt-0.5">{doc.desc}</p>
                          <span className="text-[11px] text-gray-600 block mt-1">
                            {uploaded ? (
                              <span className="text-emerald-700 font-medium">✓ Uploaded: {uploaded.latest_version?.original_filename || "File attached"}</span>
                            ) : (
                              <span className="text-gray-400">Optional</span>
                            )}
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
                            className={`px-3.5 py-1.5 font-semibold rounded-lg border text-xs inline-flex items-center space-x-1.5 transition-all shadow-xs ${
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
