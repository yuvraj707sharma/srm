"use client";

import { useState } from "react";
import { fetchApi } from "../../../../lib/api/client";
import { useRouter } from "next/navigation";
import {
  cleanPan, isValidPan,
  cleanGstin, isValidGstin, gstinMatchesPan,
  cleanIfsc, isValidIfsc,
  cleanPinCode, isValidPinCode,
  cleanPhone, isValidPhone
} from "../../../../lib/validators";

export default function VendorRegistrationPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [masterData, setMasterData] = useState({
    legal_name: "",
    trade_name: "",
    organization_type: "",
    vendor_category: "",
    pan_number: "",
    gstin: "",
    msme_registered: false,
    payment_terms: "",
    credit_days: 30,
    country: "India",
    state_province: "",
    city: "",
    address_line_1: "",
    address_line_2: "",
    postal_code: "",
    website: "",
    primary_phone: "",
    alternate_phone: "",
    currency: "INR",
    freight_terms: "",
    delivery_terms: "",
    primary_business_type: "",
    product_service_type: "",
    has_active_legal_cases: false,
    legal_case_details: "",
  });

  const [contacts, setContacts] = useState([
    { full_name: "", email: "", phone: "", contact_type: "REGIONAL_HEAD" },
    { full_name: "", email: "", phone: "", contact_type: "STATE_HEAD" }
  ]);

  const [bankDetails, setBankDetails] = useState({
    bank_name: "",
    branch_name: "",
    account_name: "",
    account_number: "",
    ifsc_code: "",
    account_type: "CURRENT",
  });

  const [financials, setFinancials] = useState({
    turnover_fy1: 0,
    turnover_fy2: 0,
    turnover_fy3: 0,
    infrastructure_base_details: "",
  });

  const [projects, setProjects] = useState([{
    hospital_name: "",
    is_300_plus_beds: false,
    project_cost: 0,
    project_duration: "",
    financial_year: ""
  }]);

  const [documents, setDocuments] = useState<{ type: string; file: File | null }[]>([
    { type: "PAN", file: null },
    { type: "GST", file: null },
    { type: "MSME", file: null },
    { type: "BALANCE_SHEET", file: null },
    { type: "PRODUCT_CATALOG", file: null },
    { type: "CANCELLED_CHEQUE", file: null }
  ]);

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!masterData.legal_name.trim()) {
        setError("Legal Name is required.");
        return;
      }
      if (!masterData.pan_number.trim()) {
        setError("PAN Number is required.");
        return;
      }
      if (!isValidPan(masterData.pan_number)) {
        setError("Please enter a valid 10-character PAN number (e.g. ABCDE1234F).");
        return;
      }
      if (!masterData.gstin.trim()) {
        setError("GSTIN is required.");
        return;
      }
      if (!isValidGstin(masterData.gstin)) {
        setError("Please enter a valid 15-character GSTIN (e.g. 08ABCDE1234F1Z5).");
        return;
      }
      const matchRes = gstinMatchesPan(masterData.gstin, masterData.pan_number);
      if (!matchRes.matches) {
        setError(`GSTIN does not match PAN! GSTIN embeds '${matchRes.gstinPan}', but entered PAN is '${cleanPan(masterData.pan_number)}'.`);
        return;
      }
      if (!masterData.primary_phone.trim()) {
        setError("Primary Phone is required.");
        return;
      }
      if (!isValidPhone(masterData.primary_phone)) {
        setError("Please enter a valid 10-digit mobile number.");
        return;
      }
      if (!masterData.postal_code.trim()) {
        setError("Postal Code / PIN is required.");
        return;
      }
      if (!isValidPinCode(masterData.postal_code)) {
        setError("Please enter a valid 6-digit PIN code.");
        return;
      }
    } else if (step === 3) {
      if (!bankDetails.bank_name.trim() || !bankDetails.account_name.trim() || !bankDetails.account_number.trim() || !bankDetails.ifsc_code.trim()) {
        setError("All bank details (Bank Name, Account Name, Number, IFSC) are mandatory.");
        return;
      }
      if (!isValidIfsc(bankDetails.ifsc_code)) {
        setError("Please enter a valid 11-character Bank IFSC Code (e.g. SBIN0000691).");
        return;
      }
    }
    setStep((s) => s + 1);
  };
  const handlePrev = () => {
    setError(null);
    setStep((s) => s - 1);
  };

  const addProject = () => {
    setProjects([...projects, { hospital_name: "", is_300_plus_beds: false, project_cost: 0, project_duration: "", financial_year: "" }]);
  };

  const updateProject = (index: number, field: string, value: any) => {
    const newProjects = [...projects];
    newProjects[index] = { ...newProjects[index], [field]: value };
    setProjects(newProjects);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // 1. Submit Master Data
      let res = await fetchApi("/api/v1/vendor-registration/master", {
        method: "PUT",
        body: JSON.stringify(masterData)
      });
      if (!res.ok) throw new Error("Failed to save Master Data");

      // 2. Submit Contacts
      res = await fetchApi("/api/v1/vendor-registration/contacts", {
        method: "PUT",
        body: JSON.stringify(contacts.filter(c => c.full_name))
      });
      if (!res.ok) throw new Error("Failed to save Contacts");

      // 3. Submit Bank Details
      res = await fetchApi("/api/v1/vendor-registration/bank", {
        method: "PUT",
        body: JSON.stringify(bankDetails)
      });
      if (!res.ok) throw new Error("Failed to save Bank Details");

      // 4. Submit Financials
      res = await fetchApi("/api/v1/vendor-registration/financials", {
        method: "PUT",
        body: JSON.stringify(financials)
      });
      if (!res.ok) throw new Error("Failed to save Financials");

      // 5. Submit Projects
      for (const p of projects) {
        if (p.hospital_name) {
          res = await fetchApi("/api/v1/vendor-registration/projects", {
            method: "POST",
            body: JSON.stringify(p)
          });
          if (!res.ok) throw new Error("Failed to save Project " + p.hospital_name);
        }
      }

      // 6. Submit Documents
      for (const doc of documents) {
        if (doc.file) {
          const formData = new FormData();
          formData.append("file", doc.file);
          
          res = await fetchApi(`/api/v1/vendor/documents?document_type=${doc.type}`, {
            method: "POST",
            body: formData,
            // don't set Content-Type, let browser set it with boundary
            headers: {} 
          });
          if (!res.ok) throw new Error("Failed to upload document " + doc.type);
        }
      }

      router.push("/vendor/dashboard");
      
    } catch (err: any) {
      setError(err.message || "An error occurred during submission.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8 text-black">
      <div className="bg-white shadow rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Comprehensive Vendor Registration</h1>
        
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm font-medium text-gray-500 mb-2">
            <span className={step >= 1 ? "text-blue-600" : ""}>1. Master Info</span>
            <span className={step >= 2 ? "text-blue-600" : ""}>2. Contacts</span>
            <span className={step >= 3 ? "text-blue-600" : ""}>3. Banking</span>
            <span className={step >= 4 ? "text-blue-600" : ""}>4. Financials</span>
            <span className={step >= 5 ? "text-blue-600" : ""}>5. Projects</span>
            <span className={step >= 6 ? "text-blue-600" : ""}>6. Documents</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(step / 6) * 100}%` }}></div>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative text-sm">
            {error}
          </div>
        )}

        <form onSubmit={step === 6 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          
          {/* STEP 1: MASTER DATA */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">1. Organization Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Legal Name *</label>
                  <input type="text" required value={masterData.legal_name} onChange={e => setMasterData({...masterData, legal_name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Trade Name</label>
                  <input type="text" value={masterData.trade_name} onChange={e => setMasterData({...masterData, trade_name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">PAN Number *</label>
                    {masterData.pan_number && (
                      <span className={`text-[11px] font-medium ${
                        isValidPan(masterData.pan_number) ? "text-emerald-600 font-semibold" : masterData.pan_number.length === 10 ? "text-rose-600 font-medium" : "text-gray-400"
                      }`}>
                        {isValidPan(masterData.pan_number) ? "✓ Valid PAN" : masterData.pan_number.length === 10 ? "⚠️ Invalid PAN" : `${masterData.pan_number.length}/10 chars`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={masterData.pan_number}
                    onChange={e => setMasterData({...masterData, pan_number: cleanPan(e.target.value).slice(0, 10)})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border font-mono"
                    placeholder="ABCDE1234F"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Format: 5 letters + 4 digits + 1 letter</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">GSTIN *</label>
                    {masterData.gstin && (
                      <span className={`text-[11px] font-medium ${
                        isValidGstin(masterData.gstin) && (!isValidPan(masterData.pan_number) || gstinMatchesPan(masterData.gstin, masterData.pan_number).matches)
                          ? "text-emerald-600 font-semibold"
                          : "text-rose-600 font-medium"
                      }`}>
                        {isValidGstin(masterData.gstin)
                          ? (isValidPan(masterData.pan_number) && !gstinMatchesPan(masterData.gstin, masterData.pan_number).matches
                              ? "⚠️ PAN mismatch"
                              : "✓ Valid GSTIN")
                          : masterData.gstin.length === 15 ? "⚠️ Invalid GST" : `${masterData.gstin.length}/15 chars`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={masterData.gstin}
                    onChange={e => setMasterData({...masterData, gstin: cleanGstin(e.target.value).slice(0, 15)})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border font-mono"
                    placeholder="08ABCDE1234F1Z5"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Format: 2 state digits + 10 PAN chars + 1 entity num + 'Z' + Checksum</p>
                </div>
                
                {/* Contact and Address */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Primary Phone *</label>
                    {masterData.primary_phone && (
                      <span className={`text-[11px] font-medium ${isValidPhone(masterData.primary_phone) ? "text-emerald-600 font-semibold" : "text-gray-400"}`}>
                        {isValidPhone(masterData.primary_phone) ? "✓ Valid Phone" : "10 digits"}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={masterData.primary_phone}
                    onChange={e => setMasterData({...masterData, primary_phone: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    placeholder="9876543210"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
                  <input type="text" value={masterData.alternate_phone} onChange={e => setMasterData({...masterData, alternate_phone: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address Line 1 *</label>
                  <input type="text" required value={masterData.address_line_1} onChange={e => setMasterData({...masterData, address_line_1: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address Line 2</label>
                  <input type="text" value={masterData.address_line_2} onChange={e => setMasterData({...masterData, address_line_2: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">City *</label>
                  <input type="text" required value={masterData.city} onChange={e => setMasterData({...masterData, city: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">State/Province *</label>
                  <input type="text" required value={masterData.state_province} onChange={e => setMasterData({...masterData, state_province: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Postal Code *</label>
                    {masterData.postal_code && (
                      <span className={`text-[11px] font-medium ${isValidPinCode(masterData.postal_code) ? "text-emerald-600 font-semibold" : "text-gray-400"}`}>
                        {isValidPinCode(masterData.postal_code) ? "✓ Valid PIN" : `${masterData.postal_code.length}/6 digits`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={masterData.postal_code}
                    onChange={e => setMasterData({...masterData, postal_code: cleanPinCode(e.target.value)})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                    placeholder="302022"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Website</label>
                  <input type="text" value={masterData.website} onChange={e => setMasterData({...masterData, website: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>

                {/* Commercials */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Terms</label>
                  <input type="text" placeholder="e.g. Net 30" value={masterData.payment_terms} onChange={e => setMasterData({...masterData, payment_terms: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Delivery Terms</label>
                  <input type="text" placeholder="e.g. FOB" value={masterData.delivery_terms} onChange={e => setMasterData({...masterData, delivery_terms: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>

                <div className="flex items-center mt-6">
                  <input type="checkbox" id="msme" checked={masterData.msme_registered} onChange={e => setMasterData({...masterData, msme_registered: e.target.checked})} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  <label htmlFor="msme" className="ml-2 block text-sm text-gray-900">MSME Registered</label>
                </div>
                {/* Legal Cases */}
                <div className="col-span-1 md:col-span-2 border-t pt-4 mt-4">
                  <div className="flex items-center mb-4">
                    <input type="checkbox" id="legal" checked={masterData.has_active_legal_cases} onChange={e => setMasterData({...masterData, has_active_legal_cases: e.target.checked})} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                    <label htmlFor="legal" className="ml-2 block text-sm font-medium text-gray-900">Company has active Legal Cases?</label>
                  </div>
                  {masterData.has_active_legal_cases && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Legal Case Details (Confirmations, Consents, Active status) *</label>
                      <textarea rows={4} required value={masterData.legal_case_details || ""} onChange={e => setMasterData({...masterData, legal_case_details: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Please provide full details regarding any active legal cases..."></textarea>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONTACTS */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">2. Key Contacts</h2>
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-4">Regional Head Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700">Full Name *</label>
                      <input type="text" required value={contacts[0].full_name} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[0].full_name = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Email</label>
                      <input type="email" value={contacts[0].email} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[0].email = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Phone</label>
                      <input type="text" value={contacts[0].phone} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[0].phone = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-4">State Head Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700">Full Name *</label>
                      <input type="text" required value={contacts[1].full_name} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[1].full_name = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Email</label>
                      <input type="email" value={contacts[1].email} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[1].email = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Phone</label>
                      <input type="text" value={contacts[1].phone} onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[1].phone = e.target.value;
                        setContacts(newContacts);
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BANKING */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">3. Bank Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bank Name *</label>
                  <input type="text" required value={bankDetails.bank_name} onChange={e => setBankDetails({...bankDetails, bank_name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Account Name *</label>
                  <input type="text" required value={bankDetails.account_name} onChange={e => setBankDetails({...bankDetails, account_name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Account Number *</label>
                  <input type="text" required value={bankDetails.account_number} onChange={e => setBankDetails({...bankDetails, account_number: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">IFSC Code *</label>
                    {bankDetails.ifsc_code && (
                      <span className={`text-[11px] font-medium ${
                        isValidIfsc(bankDetails.ifsc_code) ? "text-emerald-600 font-semibold" : bankDetails.ifsc_code.length === 11 ? "text-rose-600 font-medium" : "text-gray-400"
                      }`}>
                        {isValidIfsc(bankDetails.ifsc_code) ? "✓ Valid IFSC" : bankDetails.ifsc_code.length === 11 ? "⚠️ Invalid IFSC" : `${bankDetails.ifsc_code.length}/11 chars`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={bankDetails.ifsc_code}
                    onChange={e => setBankDetails({...bankDetails, ifsc_code: cleanIfsc(e.target.value).slice(0, 11)})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border font-mono"
                    placeholder="SBIN0000691"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Format: 4 letters + 0 + 6 alphanumeric</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: FINANCIALS */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">4. Financial Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Turnover FY 25-26 (₹)</label>
                  <input type="number" value={financials.turnover_fy1 || ''} onChange={e => setFinancials({...financials, turnover_fy1: e.target.value ? parseFloat(e.target.value) : 0})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Turnover FY 24-25 (₹)</label>
                  <input type="number" value={financials.turnover_fy2 || ''} onChange={e => setFinancials({...financials, turnover_fy2: e.target.value ? parseFloat(e.target.value) : 0})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Turnover FY 23-24 (₹)</label>
                  <input type="number" value={financials.turnover_fy3 || ''} onChange={e => setFinancials({...financials, turnover_fy3: e.target.value ? parseFloat(e.target.value) : 0})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Infrastructure / Service Base at Jaipur/Rajasthan</label>
                <textarea rows={3} value={financials.infrastructure_base_details} onChange={e => setFinancials({...financials, infrastructure_base_details: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
            </div>
          )}

          {/* STEP 5: PROJECTS */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">5. Past Project Experience</h2>
              <p className="text-sm text-gray-600">Please detail projects delivered in hospitals (preferably {'>'} 300 beds) over the last 3 years.</p>
              
              {projects.map((proj, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-md border mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Hospital / College Name</label>
                      <input type="text" value={proj.hospital_name} onChange={e => updateProject(index, 'hospital_name', e.target.value)} className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Financial Year</label>
                      <input type="text" placeholder="e.g. 2024-25" value={proj.financial_year} onChange={e => updateProject(index, 'financial_year', e.target.value)} className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Project Cost (₹)</label>
                      <input type="number" value={proj.project_cost || ''} onChange={e => updateProject(index, 'project_cost', e.target.value ? parseFloat(e.target.value) : 0)} className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm p-2 border" />
                    </div>
                    <div className="flex items-center mt-5">
                      <input type="checkbox" checked={proj.is_300_plus_beds} onChange={e => updateProject(index, 'is_300_plus_beds', e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                      <label className="ml-2 block text-xs text-gray-900">{'>'} 300 Beds</label>
                    </div>
                  </div>
                </div>
              ))}
              
              <button type="button" onClick={addProject} className="text-sm text-blue-600 font-medium hover:text-blue-500">
                + Add another project
              </button>
            </div>
          )}

          {/* STEP 6: DOCUMENTS */}
          {step === 6 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">5. Document Uploads</h2>
              <p className="text-sm text-gray-600">Please upload the requested documents. Supported formats: PDF, JPEG, PNG.</p>
              
              <div className="space-y-4">
                {documents.map((doc, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 border rounded-md">
                    <div className="mb-2 md:mb-0">
                      <span className="block font-medium text-gray-800 text-sm">{doc.type.replace(/_/g, " ")}</span>
                    </div>
                    <div>
                      <input 
                        type="file" 
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={e => {
                          const newDocs = [...documents];
                          newDocs[idx].file = e.target.files ? e.target.files[0] : null;
                          setDocuments(newDocs);
                        }}
                        className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 flex justify-between border-t pt-6">
            <button type="button" onClick={handlePrev} disabled={step === 1} className="px-4 py-2 border rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
              Previous
            </button>
            
            {step < 6 ? (
              <button type="submit" className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                Next
              </button>
            ) : (
              <button type="submit" disabled={loading} className="px-8 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                {loading ? "Submitting..." : "Submit Registration"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
