"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api/client";

interface BOQItem {
  id: string;
  item_code?: string;
  item_name: string;
  specifications?: string;
  quantity: number;
  uom: string;
  category?: string;
  attributes: Record<string, string>;
}

interface SubmittedItem {
  submission_item_id: string;
  boq_item_id: string;
  quoted_unit_price: number;
  total_amount: number;
  gst_percent?: number;
  gst_amount?: number;
  make_model_quoted?: string;
  technical_compliance: string;
  vendor_remarks?: string;
}

interface ExistingSubmission {
  id: string;
  status: string;
  submission_type: string;
  submitted_at?: string;
  sub_total: number;
  gst_percent: number;
  gst_amount: number;
  grand_total: number;
  payment_terms?: string;
  delivery_time?: string;
  warranty_terms?: string;
  model_no?: string;
  tank_capacity_location?: string;
  document_version_id?: string;
  extracted_data?: any;
  items: SubmittedItem[];
}

interface TenderDetail {
  id: string;
  tender_number: string;
  title: string;
  department?: string;
  description?: string;
  boq_type?: "COMMERCIAL" | "TECHNICAL" | "TECHNOCOMMERCIAL";
  status: string;
  published_at?: string;
  deadline_at?: string;
  is_deadline_passed: boolean;
  is_locked: boolean;
  can_revise?: boolean;
  remaining_seconds: number;
  allow_download: boolean;
  document_version_id?: string;
  custom_columns: string[];
  items: BOQItem[];
  submission?: ExistingSubmission;
}

interface BidFormItem {
  boq_item_id: string;
  quoted_unit_price: number;
  make_model_quoted: string;
  technical_compliance: string;
  vendor_remarks: string;
  gst_percent: number;
}

export default function VendorTenderBiddingPage() {
  const params = useParams();
  const router = useRouter();
  const boqId = params.id as string;

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Strictly TWO submission options as requested:
  // 1: Writing / Pasting Raw Text ("RAW_TEXT")
  // 2: Submitting a PDF Quotation ("PDF")
  const [activeTab, setActiveTab] = useState<"RAW_TEXT" | "PDF">("RAW_TEXT");

  // Raw text input state
  const [rawTextQuote, setRawTextQuote] = useState("");

  // Revision & Draft State
  const [isEditingRevised, setIsEditingRevised] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [parsingText, setParsingText] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);

  // Form Quotation Item State (Line-by-line verification table)
  const [formItems, setFormItems] = useState<Record<string, BidFormItem>>({});
  const [paymentTerms, setPaymentTerms] = useState("30 Days against delivery and acceptance");
  const [deliveryTime, setDeliveryTime] = useState("4 to 6 Weeks from PO");
  const [warrantyTerms, setWarrantyTerms] = useState("Standard 12 Months Comprehensive");

  // PDF Upload State
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Final confirmation modal
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const quotationSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTender();
    const interval = setInterval(() => {
      setTender((prev) => {
        if (!prev) return prev;
        const newSecs = Math.max(0, prev.remaining_seconds - 1);
        return {
          ...prev,
          remaining_seconds: newSecs,
          is_deadline_passed: newSecs <= 1 ? true : prev.is_deadline_passed,
          is_locked: newSecs <= 1 ? true : prev.is_locked,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [boqId]);

  async function loadTender() {
    try {
      setLoading(true);
      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}`);
      if (!res.ok) {
        throw new Error("Failed to load tender details.");
      }
      const data: TenderDetail = await res.json();
      setTender(data);

      // Pre-fill form inputs from previous submission (DRAFT or SUBMITTED) or default to empty
      const initialForm: Record<string, BidFormItem> = {};
      const subItemsMap = new Map((data.submission?.items || []).map((si) => [si.boq_item_id, si]));

      data.items.forEach((it) => {
        const existing = subItemsMap.get(it.id);
        initialForm[it.id] = {
          boq_item_id: it.id,
          quoted_unit_price: existing ? Number(existing.quoted_unit_price) : 0,
          make_model_quoted: existing?.make_model_quoted || "",
          technical_compliance: existing?.technical_compliance || "COMPLIANT",
          vendor_remarks: existing?.vendor_remarks || "",
          gst_percent: existing?.gst_percent !== undefined ? Number(existing.gst_percent) : 18,
        };
      });
      setFormItems(initialForm);

      if (data.submission) {
        if (data.submission.payment_terms) setPaymentTerms(data.submission.payment_terms);
        if (data.submission.delivery_time) setDeliveryTime(data.submission.delivery_time);
        if (data.submission.warranty_terms) setWarrantyTerms(data.submission.warranty_terms);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "🔒 Time Lock Closed";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `⏳ ${d}d ${h}h ${m}m ${s}s remaining`;
    return `⏳ ${h}h ${m}m ${s}s remaining`;
  };

  // Calculations for quotation table
  const calculateFormTotals = () => {
    if (!tender) return { subTotal: 0, gstAmount: 0, grandTotal: 0 };
    let sub = 0;
    let gstTotal = 0;
    tender.items.forEach((it) => {
      const q = formItems[it.id];
      const rate = q ? Number(q.quoted_unit_price) || 0 : 0;
      const gstPct = q ? Number(q.gst_percent ?? 18) : 18;
      const itemSub = rate * it.quantity;
      sub += itemSub;
      gstTotal += itemSub * (gstPct / 100);
    });
    return { subTotal: sub, gstAmount: gstTotal, grandTotal: sub + gstTotal };
  };

  const handleFormItemChange = (itemId: string, field: keyof BidFormItem, value: any) => {
    setFormItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  // -------------------------------------------------------------------------
  // OPTION 1: RAW TEXT QUOTATION ACTIONS
  // -------------------------------------------------------------------------

  // Insert Admin BOQ Items as a formatted template into the textarea
  const handleInsertBoqTemplate = () => {
    if (!tender) return;
    const lines = tender.items.map((it, idx) => {
      return `${idx + 1}. ${it.item_name} (Qty: ${it.quantity} ${it.uom}) - Rate:  | Make:  | GST: 18% | Compliance: COMPLIANT`;
    });
    const templateText = `${lines.join("\n")}\n\nCommercial Terms:\nPayment Terms: 30 Days against delivery and acceptance\nDelivery Period: 4 to 6 Weeks from PO\nWarranty Terms: Standard 12 Months Comprehensive`;
    setRawTextQuote(templateText);
    setSuccessMsg("📋 BOQ line items template inserted! Simply fill in your quoted rates and make/model, then click 'Load Quoted Rates'.");
  };

  // Instant Client-side Parser: maps typed lines to tender items without network wait
  const handleInstantParseRawText = () => {
    if (!rawTextQuote.trim() || !tender) {
      setError("Please write or paste your quotation text above before loading.");
      return;
    }
    setError(null);

    const lines = rawTextQuote.split("\n").map((l) => l.trim()).filter(Boolean);
    const updatedForm = { ...formItems };
    let matchCount = 0;

    // 1. Detect commercial terms
    for (const line of lines) {
      const lLower = line.toLowerCase();
      if (lLower.startsWith("payment terms:") || lLower.startsWith("payment:")) {
        const val = line.substring(line.indexOf(":") + 1).trim();
        if (val) setPaymentTerms(val);
      } else if (lLower.startsWith("delivery period:") || lLower.startsWith("delivery:") || lLower.startsWith("delivery time:")) {
        const val = line.substring(line.indexOf(":") + 1).trim();
        if (val) setDeliveryTime(val);
      } else if (lLower.startsWith("warranty terms:") || lLower.startsWith("warranty:")) {
        const val = line.substring(line.indexOf(":") + 1).trim();
        if (val) setWarrantyTerms(val);
      }
    }

    // 2. Match each tender item
    tender.items.forEach((item, idx) => {
      const itemNumStr = `${idx + 1}`;

      // Check if line starts with 1., 1), 1 - or contains item code/name
      let targetLine = lines.find((l) => {
        const trimmed = l.trim();
        return (
          trimmed.startsWith(`${itemNumStr}.`) ||
          trimmed.startsWith(`${itemNumStr})`) ||
          trimmed.startsWith(`${itemNumStr} -`) ||
          trimmed.startsWith(`${itemNumStr} |`) ||
          (item.item_code && trimmed.toLowerCase().includes(item.item_code.toLowerCase())) ||
          (item.item_name && trimmed.toLowerCase().includes(item.item_name.substring(0, 15).toLowerCase()))
        );
      });

      // Fallback by line index if sequential
      if (!targetLine && idx < lines.length) {
        const cand = lines[idx];
        const cLow = cand.toLowerCase();
        if (!cLow.startsWith("payment") && !cLow.startsWith("delivery") && !cLow.startsWith("warranty") && !cLow.startsWith("commercial")) {
          targetLine = cand;
        }
      }

      if (targetLine) {
        // Extract rate
        let quotedPrice = 0;
        const rateMatch = targetLine.match(/(?:rate|price|unit price|rs\.?|inr|₹)\s*[:=-]?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        if (rateMatch) {
          quotedPrice = parseFloat(rateMatch[1].replace(/,/g, ""));
        } else {
          // Look for any standalone number after the item number prefix
          const stripped = targetLine.replace(new RegExp(`^${itemNumStr}[.)\\-\\s]+`), "");
          const numMatch = stripped.match(/([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/);
          if (numMatch) {
            quotedPrice = parseFloat(numMatch[1].replace(/,/g, ""));
          }
        }

        // Extract make / model
        let makeModel = "";
        const makeMatch = targetLine.match(/(?:make|model|brand|mfg)\s*[:=-]?\s*([^|;\n,]+)/i);
        if (makeMatch) {
          makeModel = makeMatch[1].trim();
        }

        // Extract GST %
        let gstPct = updatedForm[item.id]?.gst_percent ?? 18;
        const gstMatch = targetLine.match(/gst\s*[:=-]?\s*(\d+)%?/i);
        if (gstMatch) {
          gstPct = Number(gstMatch[1]);
        }

        // Extract compliance
        let comp = updatedForm[item.id]?.technical_compliance || "COMPLIANT";
        if (/non[- ]?compliant/i.test(targetLine)) {
          comp = "NON_COMPLIANT";
        } else if (/deviation/i.test(targetLine)) {
          comp = "DEVIATION";
        } else if (/compliant/i.test(targetLine)) {
          comp = "COMPLIANT";
        }

        if (quotedPrice > 0 || makeModel) {
          updatedForm[item.id] = {
            ...updatedForm[item.id],
            boq_item_id: item.id,
            quoted_unit_price: quotedPrice || updatedForm[item.id]?.quoted_unit_price || 0,
            make_model_quoted: makeModel || updatedForm[item.id]?.make_model_quoted || "",
            gst_percent: gstPct,
            technical_compliance: comp,
          };
          matchCount++;
        }
      }
    });

    setFormItems(updatedForm);
    setSuccessMsg(`⚡ Loaded ${matchCount} quoted item rates into the review table below! Please verify prices and click Submit.`);
    quotationSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // AI Deep Extraction: calls Gemini 3.8 to parse complex text quotations
  const handleAIExtractRawText = async () => {
    if (!rawTextQuote.trim() || !tender) {
      setError("Please write or paste your quotation text above before extracting with AI.");
      return;
    }
    setParsingText(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/parse-bid-text`, {
        method: "POST",
        body: JSON.stringify({ raw_text: rawTextQuote }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "AI text extraction failed.");
      }

      const resData = await res.json();
      const parsedBid = resData.parsed_bid || {};
      const parsedItems: any[] = parsedBid.items || [];

      setFormItems((prev) => {
        const updated = { ...prev };
        parsedItems.forEach((pi) => {
          if (pi.boq_item_id && updated[pi.boq_item_id]) {
            updated[pi.boq_item_id] = {
              ...updated[pi.boq_item_id],
              quoted_unit_price: Number(pi.quoted_unit_price) || updated[pi.boq_item_id].quoted_unit_price,
              make_model_quoted: pi.make_model_quoted || updated[pi.boq_item_id].make_model_quoted,
              technical_compliance: pi.technical_compliance || updated[pi.boq_item_id].technical_compliance,
              vendor_remarks: pi.vendor_remarks || updated[pi.boq_item_id].vendor_remarks,
              gst_percent: pi.gst_percent !== undefined ? Number(pi.gst_percent) : updated[pi.boq_item_id].gst_percent,
            };
          }
        });
        return updated;
      });

      if (parsedBid.payment_terms) setPaymentTerms(parsedBid.payment_terms);
      if (parsedBid.delivery_time) setDeliveryTime(parsedBid.delivery_time);
      if (parsedBid.warranty_terms) setWarrantyTerms(parsedBid.warranty_terms);

      setSuccessMsg(`🤖 AI successfully mapped ${parsedItems.length} quoted items and commercial terms into the table below!`);
      quotationSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Failed to extract quotation text via AI.");
    } finally {
      setParsingText(false);
    }
  };

  // -------------------------------------------------------------------------
  // OPTION 2: PDF QUOTATION SUBMISSION ACTIONS
  // -------------------------------------------------------------------------

  const handlePdfFileSelect = (file: File) => {
    const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024; // 7 MB
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files (.pdf) are supported for PDF quotation submission.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File "${file.name}" exceeds the maximum allowed limit of 7 MB.`);
      return;
    }
    setSelectedPdf(file);
    setError(null);
  };

  // Extract PDF Quotes into Review Table (No DB Commit)
  const handleParsePdfIntoForm = async () => {
    if (!selectedPdf) {
      setError("Please select a PDF quotation file first.");
      return;
    }

    setParsingPdf(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedPdf);

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/parse-bid-file`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "PDF quotation extraction failed.");
      }

      const resData = await res.json();
      const parsedBid = resData.parsed_bid || {};
      const parsedItems: any[] = parsedBid.items || [];

      setFormItems((prev) => {
        const updated = { ...prev };
        parsedItems.forEach((pi) => {
          if (pi.boq_item_id && updated[pi.boq_item_id]) {
            updated[pi.boq_item_id] = {
              ...updated[pi.boq_item_id],
              quoted_unit_price: Number(pi.quoted_unit_price) || updated[pi.boq_item_id].quoted_unit_price,
              make_model_quoted: pi.make_model_quoted || updated[pi.boq_item_id].make_model_quoted,
              technical_compliance: pi.technical_compliance || updated[pi.boq_item_id].technical_compliance,
              vendor_remarks: pi.vendor_remarks || updated[pi.boq_item_id].vendor_remarks,
              gst_percent: pi.gst_percent !== undefined ? Number(pi.gst_percent) : updated[pi.boq_item_id].gst_percent,
            };
          }
        });
        return updated;
      });

      if (parsedBid.payment_terms) setPaymentTerms(parsedBid.payment_terms);
      if (parsedBid.delivery_time) setDeliveryTime(parsedBid.delivery_time);
      if (parsedBid.warranty_terms) setWarrantyTerms(parsedBid.warranty_terms);

      setSuccessMsg(`Extracted quotation data from PDF "${selectedPdf.name}". Review the rates below before submitting.`);
      quotationSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Failed to extract quotation data from PDF.");
    } finally {
      setParsingPdf(false);
    }
  };

  // Direct Submit & Seal PDF Quotation File
  const handleDirectSubmitPdf = async () => {
    if (!selectedPdf) {
      setError("Please select a PDF quotation file first.");
      return;
    }

    setUploadingPdf(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedPdf);

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/upload-bid`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "PDF processing and submission failed.");
      }

      setIsEditingRevised(false);
      setSelectedPdf(null);
      setSuccessMsg("PDF quotation uploaded and sealed successfully for evaluation!");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to upload and submit PDF quotation.");
    } finally {
      setUploadingPdf(false);
    }
  };

  // -------------------------------------------------------------------------
  // FINAL SUBMISSION & DRAFT ACTIONS
  // -------------------------------------------------------------------------

  // Save as Draft (Unsealed)
  const handleSaveDraft = async () => {
    if (!tender) return;
    setSavingDraft(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const itemsPayload = Object.values(formItems).map((it) => ({
        boq_item_id: it.boq_item_id,
        quoted_unit_price: Number(it.quoted_unit_price) || 0,
        make_model_quoted: it.make_model_quoted || undefined,
        technical_compliance: it.technical_compliance || "COMPLIANT",
        vendor_remarks: it.vendor_remarks || undefined,
        gst_percent: it.gst_percent ?? 18,
      }));

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          items: itemsPayload,
          gst_percent: 18.0,
          payment_terms: paymentTerms,
          delivery_time: deliveryTime,
          warranty_terms: warrantyTerms,
          is_draft: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Draft save failed.");
      }

      setSuccessMsg("Draft saved successfully! You can return anytime to continue your quotation before the deadline.");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Bulk Apply GST % to all items
  const handleApplyGstToAll = (pct: number) => {
    setFormItems((prev) => {
      const updated: Record<string, BidFormItem> = {};
      Object.keys(prev).forEach((key) => {
        updated[key] = { ...prev[key], gst_percent: pct };
      });
      return updated;
    });
  };

  // Bulk Mark All items as COMPLIANT
  const handleMarkAllCompliant = () => {
    setFormItems((prev) => {
      const updated: Record<string, BidFormItem> = {};
      Object.keys(prev).forEach((key) => {
        updated[key] = { ...prev[key], technical_compliance: "COMPLIANT" };
      });
      return updated;
    });
  };

  // Submit & Lock via Verified Table
  const handleConfirmSubmitForm = async () => {
    if (!tender) return;
    setSubmitting(true);
    setError(null);
    try {
      const itemsPayload = Object.values(formItems).map((it) => ({
        boq_item_id: it.boq_item_id,
        quoted_unit_price: Number(it.quoted_unit_price) || 0,
        make_model_quoted: it.make_model_quoted || undefined,
        technical_compliance: it.technical_compliance || "COMPLIANT",
        vendor_remarks: it.vendor_remarks || undefined,
        gst_percent: it.gst_percent ?? 18,
      }));

      const res = await fetchApi(`/api/v1/vendor/tenders/${boqId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          items: itemsPayload,
          gst_percent: 18.0,
          payment_terms: paymentTerms,
          delivery_time: deliveryTime,
          warranty_terms: warrantyTerms,
          is_draft: false,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Submission failed.");
      }

      setShowConfirmModal(false);
      setIsEditingRevised(false);
      setSuccessMsg("Quotation successfully submitted and sealed for evaluation.");
      await loadTender();
    } catch (err: any) {
      setError(err.message || "Failed to submit quotation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-semibold">Loading Tender Specifications &amp; Bid Lock...</span>
      </div>
    );
  }

  if (error && !tender) {
    return (
      <div className="p-12 text-center text-red-600 max-w-md mx-auto">
        <h3 className="text-lg font-bold">Error Loading Tender</h3>
        <p className="text-xs text-slate-500 mt-1">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg"
        >
          ← Return to Tenders
        </button>
      </div>
    );
  }

  if (!tender) return null;

  const isSubmitted = tender.submission && tender.submission.status === "SUBMITTED";
  const { subTotal, gstAmount, grandTotal } = calculateFormTotals();

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900 pb-20 font-sans">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1 flex-wrap gap-y-1">
            <Link href="/vendor/dashboard" className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">
              🏠 Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <Link href="/vendor/tenders" className="text-xs font-semibold text-blue-600 hover:underline">
              Active Tenders
            </Link>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {tender.tender_number}
            </span>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
              tender.boq_type === "COMMERCIAL"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : tender.boq_type === "TECHNICAL"
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-purple-50 text-purple-800 border-purple-200"
            }`}>
              {tender.boq_type || "COMMERCIAL"} BOQ
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{tender.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Department: <strong>{tender.department || "Medical College Procurement"}</strong> • {tender.items.length} Line Items
            {tender.boq_type === "COMMERCIAL" && (
              <span className="text-amber-700 font-semibold ml-2">
                (Commercial Evaluation: Evaluated on Unit Supply &amp; One-Time Charges)
              </span>
            )}
          </p>
        </div>

        {/* Live Lock Timer & Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/vendor/dashboard"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 transition-colors"
            title="Return to Vendor Dashboard"
          >
            <span>🏠</span>
            <span>Dashboard</span>
          </Link>

          {!isSubmitted && !tender.is_deadline_passed && (
            <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                Time-Lock Countdown
              </span>
              <span className="text-xs font-black text-amber-900 animate-pulse">
                {formatCountdown(tender.remaining_seconds)}
              </span>
            </div>
          )}

          {tender.document_version_id && (
            <a
              href={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/v1/vendor/tenders/${tender.id}/document`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs border border-blue-200 transition-colors"
            >
              <span>📄</span>
              <span>Download Admin Tender BOQ Document</span>
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 text-xs font-bold">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. OFFICIAL BOQ SCHEDULE CREATED BY ADMIN (EXACT ITEMS & SPECS VERBATIM) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xl shrink-0">
              📋
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-white">
                  Official BOQ Schedule &amp; Scope of Supply
                </h2>
                <span className="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/40 px-2 py-0.5 rounded-full font-bold">
                  Created by Hospital Administration
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Read all equipment descriptions, technical specifications, and quantities verbatim before preparing your quotation.
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Line Items</span>
            <span className="text-lg font-black text-amber-400 font-mono">{tender.items.length} Items</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="px-4 py-3 w-16 text-center">Code</th>
                <th className="px-4 py-3 min-w-[280px]">Item Description &amp; Technical Specifications</th>
                <th className="px-4 py-3 min-w-[160px]">Attributes &amp; Compliance Standards</th>
                <th className="px-4 py-3 w-24 text-center">Quantity</th>
                <th className="px-4 py-3 w-24 text-center">UOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tender.items.map((it, idx) => (
                <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-600">
                    {it.item_code || `#${idx + 1}`}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900 text-sm">{it.item_name}</div>
                    {it.specifications ? (
                      <div className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 whitespace-pre-line font-mono text-[11px]">
                        {it.specifications}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    {Object.keys(it.attributes || {}).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(it.attributes).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-semibold"
                          >
                            <strong className="text-blue-950">{k}:</strong> {v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center font-black text-slate-900 text-sm font-mono">
                    {it.quantity}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded text-xs">
                      {it.uom}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span>👆 Exact BOQ created by hospital administration verbatim.</span>
          <span className="text-slate-400">Target price &amp; estimated budgets are kept strictly confidential.</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CASE 1: BID ALREADY SUBMITTED & LOCKED */}
      {/* ========================================================================= */}
      {isSubmitted && !isEditingRevised && tender.submission ? (
        <div className="space-y-6">
          {/* Lock Banner */}
          <div className="bg-emerald-50 border-2 border-emerald-300/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-7 h-7 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
                  🔒
                </span>
                <h3 className="text-base font-black text-emerald-950">
                  Bid Submitted &amp; Sealed
                </h3>
              </div>
              <p className="text-xs text-emerald-800 mt-1 max-w-xl">
                Your quotation was successfully submitted on{" "}
                <strong>
                  {tender.submission.submitted_at
                    ? new Date(tender.submission.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "record"}
                </strong>
                . Quotes are sealed for tender evaluation.
              </p>

              {tender.submission.document_version_id && (
                <div className="mt-3">
                  <a
                    href={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/v1/vendor/tenders/${tender.id}/submission-document`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold border border-emerald-300 transition-colors shadow-xs"
                  >
                    <span>📥</span>
                    <span>Download Your Submitted Quotation PDF</span>
                  </a>
                </div>
              )}

              {tender.can_revise && (
                <div className="mt-4 pt-3 border-t border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-emerald-900">
                    💡 <strong>Need to adjust your quotes?</strong> The tender deadline has not passed. You can revise your quotation anytime before closing.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingRevised(true);
                      window.scrollTo({ top: 400, behavior: "smooth" });
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5 self-start sm:self-auto"
                  >
                    <span>✏️</span>
                    <span>Revise Quotation</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Quoted Value
              </span>
              <span className="text-2xl font-black text-emerald-950 font-mono">
                ₹{tender.submission.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">
                Includes GST (₹{tender.submission.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
              </span>
            </div>
          </div>

          {/* Submitted Quotation Item Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Your Submitted Itemized Quotation
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">Code</th>
                    <th className="px-4 py-3 min-w-[200px]">Item Description</th>
                    <th className="px-4 py-3 min-w-[140px]">Quoted Make / Model</th>
                    <th className="px-4 py-3 w-20 text-center">Qty</th>
                    <th className="px-4 py-3 w-20 text-center">UOM</th>
                    <th className="px-4 py-3 w-32 text-right">Unit Rate (₹)</th>
                    <th className="px-4 py-3 w-32 text-right">Total (₹)</th>
                    <th className="px-4 py-3 w-28 text-center">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tender.items.map((it) => {
                    const subItem = tender.submission?.items.find((si) => si.boq_item_id === it.id);
                    return (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-center font-mono text-slate-500">
                          {it.item_code || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {it.item_name}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {subItem?.make_model_quoted || "-"}
                        </td>
                        <td className="px-4 py-3 text-center">{it.quantity}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{it.uom}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          ₹{(subItem?.quoted_unit_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          ₹{(subItem?.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            subItem?.technical_compliance === "COMPLIANT"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {subItem?.technical_compliance || "COMPLIANT"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td colSpan={6} className="px-4 py-3 text-right text-slate-600 uppercase">
                      Sub Total (INR):
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">
                      ₹{tender.submission.sub_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={6} className="px-4 py-2.5 text-right text-slate-600 uppercase">
                      GST (18%):
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                      ₹{tender.submission.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td colSpan={6} className="px-4 py-3.5 text-right uppercase text-amber-400">
                      Grand Total Quoted:
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono">
                      ₹{tender.submission.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      ) : tender.is_deadline_passed ? (
        /* CASE 2: DEADLINE PASSED & NOT SUBMITTED */
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center shadow-xs">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            🔒
          </div>
          <h3 className="text-lg font-bold text-slate-900">Tender Submission Window Closed</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            The deadline for submitting quotations for this tender has passed. Submissions are strictly locked. Please contact Procurement Administration for queries.
          </p>
        </div>
      ) : (
        /* CASE 3: OPEN FOR SUBMISSION */
        <div className="space-y-6">
          {/* Revision Mode Banner */}
          {isEditingRevised && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-base shrink-0">
                  ✏️
                </div>
                <div>
                  <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                    Quotation Revision Mode Active
                  </h3>
                  <p className="text-xs text-amber-900/90 mt-0.5 max-w-2xl">
                    You are updating your rates before the tender deadline. Your previously submitted quotation remains on file until you submit this new revision.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingRevised(false)}
                className="px-4 py-2 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl font-bold text-xs transition-colors whitespace-nowrap self-start md:self-auto"
              >
                ✕ Cancel Revision &amp; View Sealed Quote
              </button>
            </div>
          )}

          {/* Saved Draft Banner */}
          {tender.submission?.status === "DRAFT" && !isEditingRevised && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
              <span className="text-xl">📝</span>
              <div className="text-xs text-blue-900">
                <span className="font-bold">Draft in Progress:</span> You have saved work on this tender. You can adjust your numbers at any time and click <strong className="text-blue-950">&quot;Submit &amp; Lock Quotation&quot;</strong> before the deadline closes.
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. STRICTLY TWO SUBMISSION WAYS: 1) RAW TEXT, 2) PDF QUOTATION           */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <span>💼</span>
                  <span>Quotation Submission Method</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select your preferred way to quote: write/paste raw text like admin does, or upload your PDF quotation.
                </p>
              </div>

              {/* The Two Allowed Submission Tabs */}
              <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("RAW_TEXT")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    activeTab === "RAW_TEXT"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <span>📝</span>
                  <span>1. Write / Paste Raw Text</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("PDF")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    activeTab === "PDF"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <span>📄</span>
                  <span>2. Submit PDF Quotation</span>
                </button>
              </div>
            </div>

            {/* --------------------------------------------------------------------- */}
            {/* WAY 1: WRITE / PASTE RAW TEXT QUOTATION                               */}
            {/* --------------------------------------------------------------------- */}
            {activeTab === "RAW_TEXT" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                      <span>📝</span>
                      <span>Type or Paste Raw Quotation Text</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Type your quoted rates line-by-line, or paste from your proposal / email. Click <strong>&quot;Load Quoted Rates&quot;</strong> or <strong>&quot;AI Extract&quot;</strong> to populate the review table below.
                    </p>
                  </div>

                  {/* Template Quick Insert */}
                  <button
                    type="button"
                    onClick={handleInsertBoqTemplate}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 self-start md:self-auto shrink-0 shadow-xs"
                    title="Pre-populate the text box with the admin's exact BOQ line items"
                  >
                    <span>📋</span>
                    <span>Insert BOQ Items Template</span>
                  </button>
                </div>

                {/* Raw Textarea */}
                <div className="relative">
                  <textarea
                    rows={9}
                    value={rawTextQuote}
                    onChange={(e) => setRawTextQuote(e.target.value)}
                    placeholder={`Example:\n1. Liquid Medical Oxygen (LMO) - Rate: 15.50 / SM3 | Make: Inox Air Products | GST: 18% | COMPLIANT\n2. Vacuum Insulated Storage Tank 20KL - Rate: 3800000 | Make: VRV / Chart Industries | GST: 18% | COMPLIANT\n3. Ambient Air Vaporizer 500 Nm3/hr - Rate: 750000 | Make: Inox India | GST: 18% | COMPLIANT\n\nCommercial Terms:\nPayment Terms: 30 Days against delivery and acceptance\nDelivery Period: 4 to 6 Weeks from PO\nWarranty Terms: 12 Months Comprehensive`}
                    className="w-full p-4 font-mono text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-slate-50/50 leading-relaxed text-slate-900 placeholder:text-slate-400"
                  />
                  {rawTextQuote && (
                    <button
                      type="button"
                      onClick={() => setRawTextQuote("")}
                      className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 text-xs px-2 py-1 bg-white border border-slate-200 rounded-md font-bold shadow-xs"
                      title="Clear textarea"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Action Buttons for Raw Text */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                    <span>💡</span>
                    <span>Instant match uses local pattern recognition; AI extraction handles any unstructured quotation style.</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleInstantParseRawText}
                      disabled={parsingText || !rawTextQuote.trim()}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <span>⚡</span>
                      <span>Load Quoted Rates (Instant Match)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAIExtractRawText}
                      disabled={parsingText || !rawTextQuote.trim()}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <span>{parsingText ? "⏳" : "🤖"}</span>
                      <span>{parsingText ? "Gemini AI Extracting..." : "AI Extract with Gemini"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* WAY 2: UPLOAD PDF QUOTATION                                           */}
            {/* --------------------------------------------------------------------- */}
            {activeTab === "PDF" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <input
                  type="file"
                  ref={pdfInputRef}
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handlePdfFileSelect(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPdf(true);
                  }}
                  onDragLeave={() => setIsDraggingPdf(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingPdf(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handlePdfFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => !selectedPdf && pdfInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                    isDraggingPdf
                      ? "border-blue-500 bg-blue-50/50"
                      : selectedPdf
                      ? "border-emerald-300 bg-emerald-50/20"
                      : "border-slate-300 hover:border-blue-400 bg-slate-50/50"
                  }`}
                >
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
                    📄
                  </div>

                  {!selectedPdf ? (
                    <>
                      <h4 className="text-sm font-bold text-slate-900 mb-1">
                        Select or Drag &amp; Drop Your PDF Quotation
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                        Upload your official signed quotation document in PDF format (maximum size: 7 MB).
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          pdfInputRef.current?.click();
                        }}
                        className="px-5 py-2 bg-white hover:bg-slate-50 text-blue-700 font-bold text-xs border border-blue-200 rounded-xl shadow-xs transition-colors"
                      >
                        Browse PDF File
                      </button>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="inline-flex items-center space-x-3 px-4 py-2.5 bg-white border border-emerald-300 rounded-xl shadow-xs">
                        <span className="text-emerald-600 text-lg">📄</span>
                        <div className="text-left">
                          <span className="text-xs font-bold text-slate-900 block truncate max-w-sm">
                            {selectedPdf.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {(selectedPdf.size / 1024).toFixed(1)} KB • PDF Document
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPdf(null);
                          }}
                          className="text-slate-400 hover:text-red-600 text-xs font-bold ml-2"
                          title="Change file"
                        >
                          ✕ Change
                        </button>
                      </div>

                      {uploadingPdf || parsingPdf ? (
                        <div className="flex flex-col items-center space-y-2 py-2">
                          <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs font-bold text-blue-700">
                            {parsingPdf
                              ? "Gemini AI is parsing PDF chunks into the review table below..."
                              : "Uploading and sealing PDF quotation..."}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleParsePdfIntoForm();
                            }}
                            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                          >
                            <span>⚡</span>
                            <span>Extract PDF Rates into Review Table (Recommended)</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectSubmitPdf();
                            }}
                            className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                          >
                            <span>🔒</span>
                            <span>Direct Submit &amp; Seal PDF</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 3. QUOTATION BREAKDOWN & COMMERCIAL TERMS VERIFICATION TABLE              */}
            {/* ========================================================================= */}
            <div ref={quotationSectionRef} className="space-y-6 pt-2">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                {/* Table Top Toolbar with Bulk Actions */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                      <span>📊</span>
                      <span>Itemized Quotation Pricing &amp; Verification</span>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Verify your unit rates, quoted make/model, and GST % for each line item before submitting.
                    </span>
                  </div>

                  {/* Bulk Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-1 bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-xs shadow-xs">
                      <span className="text-slate-500 font-semibold text-[11px]">⚡ Set All GST:</span>
                      {[0, 5, 12, 18, 28].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleApplyGstToAll(pct)}
                          className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition-colors"
                          title={`Set GST to ${pct}% for all items`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleMarkAllCompliant}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1 shadow-xs"
                    >
                      <span>✅</span>
                      <span>Mark All Compliant</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-20">
                      <tr>
                        <th className="px-3 py-3 w-14 text-center sticky left-0 z-30 bg-slate-100">Code</th>
                        <th className="px-3 py-3 min-w-[220px] sticky left-14 z-30 bg-slate-100 border-r border-slate-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                          Item Description
                        </th>
                        <th className="px-3 py-3 w-16 text-center">Qty</th>
                        <th className="px-3 py-3 w-16 text-center">UOM</th>
                        <th className="px-3 py-3 min-w-[160px]">Quoted Make &amp; Model</th>
                        <th className="px-3 py-3 w-32 text-right">Unit Rate (₹)</th>
                        <th className="px-3 py-3 w-20 text-center">GST %</th>
                        <th className="px-3 py-3 w-32 text-right">Total (₹)</th>
                        <th className="px-3 py-3 w-32 text-center">Compliance</th>
                        <th className="px-3 py-3 min-w-[140px]">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tender.items.map((it) => {
                        const formVal = formItems[it.id] || {
                          boq_item_id: it.id,
                          quoted_unit_price: 0,
                          make_model_quoted: "",
                          technical_compliance: "COMPLIANT",
                          vendor_remarks: "",
                          gst_percent: 18,
                        };
                        const gstPct = Number(formVal.gst_percent ?? 18);
                        const total = (Number(formVal.quoted_unit_price) || 0) * it.quantity;
                        const itemGst = total * (gstPct / 100);

                        return (
                          <tr key={it.id} className="hover:bg-slate-50/60 group">
                            {/* Sticky Column 1: Code */}
                            <td className="px-3 py-3 text-center font-mono text-slate-500 font-semibold sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                              {it.item_code || "-"}
                            </td>

                            {/* Sticky Column 2: Name */}
                            <td className="px-3 py-3 sticky left-14 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                              <div className="font-bold text-slate-900">{it.item_name}</div>
                            </td>

                            {/* Qty & UOM */}
                            <td className="px-3 py-3 text-center font-bold">{it.quantity}</td>
                            <td className="px-3 py-3 text-center text-slate-500">{it.uom}</td>

                            {/* Quoted Make & Model */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="e.g. Inox Air / VRV / Philips"
                                value={formVal.make_model_quoted}
                                onChange={(e) => handleFormItemChange(it.id, "make_model_quoted", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                              />
                            </td>

                            {/* Unit Rate */}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="0.00"
                                value={formVal.quoted_unit_price || ""}
                                onChange={(e) => handleFormItemChange(it.id, "quoted_unit_price", e.target.value)}
                                className="w-full text-right px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                              />
                            </td>

                            {/* GST % */}
                            <td className="px-2 py-2">
                              <select
                                value={formVal.gst_percent ?? 18}
                                onChange={(e) => handleFormItemChange(it.id, "gst_percent", Number(e.target.value))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-center"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>

                            {/* Line Total */}
                            <td className="px-3 py-3 text-right">
                              <div className="font-mono font-bold text-slate-900">₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">+ ₹{itemGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })} GST</div>
                            </td>

                            {/* Compliance */}
                            <td className="px-2 py-2">
                              <select
                                value={formVal.technical_compliance}
                                onChange={(e) => handleFormItemChange(it.id, "technical_compliance", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold"
                              >
                                <option value="COMPLIANT">COMPLIANT</option>
                                <option value="DEVIATION">DEVIATION</option>
                                <option value="NON_COMPLIANT">NON-COMPLIANT</option>
                              </select>
                            </td>

                            {/* Remarks */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="Notes..."
                                value={formVal.vendor_remarks}
                                onChange={(e) => handleFormItemChange(it.id, "vendor_remarks", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Calculation Summary Bar */}
                <div className="bg-slate-900 text-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      Commercial Quotation Summary
                    </span>
                    <div className="flex items-center space-x-6 text-xs">
                      <div>
                        <span className="text-slate-400">Sub Total: </span>
                        <span className="font-mono font-bold">₹{subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Total GST: </span>
                        <span className="font-mono font-bold">₹{gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-right mr-2">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">Grand Total</span>
                      <span className="text-2xl font-black text-white font-mono">
                        ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Action 1: Save as Draft */}
                    <button
                      type="button"
                      disabled={savingDraft || submitting}
                      onClick={handleSaveDraft}
                      className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center space-x-1.5 disabled:opacity-50"
                      title="Save your quotation progress without locking"
                    >
                      <span>{savingDraft ? "⏳" : "💾"}</span>
                      <span>{savingDraft ? "Saving Draft..." : "Save Draft"}</span>
                    </button>

                    {/* Action 2: Submit & Lock */}
                    <button
                      type="button"
                      disabled={savingDraft || submitting}
                      onClick={() => setShowConfirmModal(true)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center space-x-2 disabled:opacity-50"
                    >
                      <span>🔒</span>
                      <span>{isEditingRevised ? "Submit Revised Quotation" : "Submit & Lock Quotation"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Commercial Terms Section */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Delivery Period
                  </label>
                  <input
                    type="text"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Warranty Terms
                  </label>
                  <input
                    type="text"
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3 text-2xl">
              🔒
            </div>
            <h3 className="text-lg font-bold text-slate-900">Confirm Bid Submission</h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you are ready to submit your commercial quotation of:
            </p>
            <div className="my-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-xl text-slate-900">
              ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 mb-4">
              <strong>Notice:</strong> Your quotation will be officially recorded and sealed for tender evaluation. You can revise your rates anytime until the tender submission deadline closes.
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Go Back &amp; Review
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitForm}
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-md"
              >
                {submitting ? "Submitting..." : isEditingRevised ? "Submit Revision" : "Confirm & Submit Bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
