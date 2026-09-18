"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../../lib/api/client";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  options?: string[];
  units?: string;
  evidence_required: boolean;
}

interface TemplateItem {
  template_id: string;
  template_title: string;
  template_version_id: string;
  version_number: number;
  questions: Question[];
}

interface QuestionnaireResponseItem {
  id: string;
  template_version_id: string;
  status: string;
  created_at: string;
}

interface VendorDoc {
  id: string;
  document_type: string;
  latest_version?: {
    id: string;
    version_number: number;
    original_filename: string;
  };
}

export default function VendorQuestionnairesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [responses, setResponses] = useState<QuestionnaireResponseItem[]>([]);
  const [vendorDocs, setVendorDocs] = useState<VendorDoc[]>([]);
  const [activeResponse, setActiveResponse] = useState<any | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TemplateItem | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [evidenceMap, setEvidenceMap] = useState<Record<string, string[]>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      // 1. Templates
      const tRes = await fetchApi("/api/v1/vendor/questionnaires/templates");
      if (tRes.ok) setTemplates(await tRes.json());

      // 2. Existing Responses
      const rRes = await fetchApi("/api/v1/vendor/questionnaires");
      if (rRes.ok) setResponses(await rRes.json());

      // 3. Vendor Documents for evidence selection
      const dRes = await fetchApi("/api/v1/vendor/documents");
      if (dRes.ok) setVendorDocs(await dRes.json());
    } catch (err) {
      setMsg({ type: "error", text: "Failed to load questionnaire data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleStartQuestionnaire = async (templateVerId: string) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetchApi(`/api/v1/vendor/questionnaires/${templateVerId}/responses`, {
        method: "POST",
      });
      if (res.ok) {
        const respData = await res.json();
        await openResponse(respData.id);
        await loadInitialData();
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || "Failed to start questionnaire." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error starting questionnaire." });
    } finally {
      setSaving(false);
    }
  };

  const openResponse = async (respId: string) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetchApi(`/api/v1/vendor/questionnaires/${respId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveResponse(data);

        // Find matching template
        const tpl = templates.find((t) => t.template_version_id === data.template_version_id);
        setActiveTemplate(tpl || null);

        // Populate answers & evidence map
        const ansObj: Record<string, any> = {};
        const evObj: Record<string, string[]> = {};
        for (const ans of data.answers || []) {
          if (ans.response_value_numeric !== null) ansObj[ans.question_id] = ans.response_value_numeric;
          else if (ans.response_value_boolean !== null) ansObj[ans.question_id] = ans.response_value_boolean;
          else ansObj[ans.question_id] = ans.response_value_text || "";

          evObj[ans.question_id] = (ans.evidence_documents || []).map((ed: any) => ed.document_version_id);
        }
        setAnswers(ansObj);
        setEvidenceMap(evObj);
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error loading response details." });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (submit: boolean = false) => {
    if (!activeResponse) return;
    setSaving(true);
    setMsg(null);

    const answersPayload = Object.entries(answers).map(([qId, val]) => ({
      question_id: qId,
      value: val,
    }));

    const url = submit
      ? `/api/v1/vendor/questionnaires/${activeResponse.id}/submit`
      : `/api/v1/vendor/questionnaires/${activeResponse.id}/save`;

    try {
      const res = await fetchApi(url, {
        method: "POST",
        body: JSON.stringify({
          answers: answersPayload,
          evidence: evidenceMap,
        }),
      });

      if (res.ok) {
        setMsg({
          type: "success",
          text: submit ? "Questionnaire submitted successfully!" : "Progress saved.",
        });
        await openResponse(activeResponse.id);
        await loadInitialData();
      } else {
        const err = await res.json();
        setMsg({ type: "error", text: err.detail?.message || "Operation failed." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "An error occurred." });
    } finally {
      setSaving(false);
    }
  };

  const toggleEvidenceDoc = (qId: string, docVerId: string) => {
    const current = evidenceMap[qId] || [];
    if (current.includes(docVerId)) {
      setEvidenceMap({ ...evidenceMap, [qId]: current.filter((id) => id !== docVerId) });
    } else {
      setEvidenceMap({ ...evidenceMap, [qId]: [...current, docVerId] });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <span className="font-bold text-sm sm:text-base text-blue-600">JECRC Medical College Hospital &amp; Research Centre <span className="text-xs text-gray-500 font-normal">(A Unit of JECRC)</span></span>
              <Link href="/vendor/dashboard" className="text-gray-500 hover:text-gray-700 px-1 pt-1 text-sm">
                Dashboard
              </Link>
              <Link href="/vendor/profile" className="text-gray-500 hover:text-gray-700 px-1 pt-1 text-sm">
                Profile
              </Link>
              <Link href="/vendor/documents" className="text-gray-500 hover:text-gray-700 px-1 pt-1 text-sm">
                Documents
              </Link>
              <Link href="/vendor/questionnaires" className="text-blue-600 font-semibold border-b-2 border-blue-600 px-1 pt-1 text-sm">
                Questionnaires
              </Link>
              <Link href="/vendor/catalogs" className="text-gray-500 hover:text-gray-700 px-1 pt-1 text-sm">
                Catalogs
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6">Vendor Dynamic Questionnaires</h1>

        {msg && (
          <div className={`mb-6 p-4 rounded text-sm ${msg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {msg.text}
          </div>
        )}

        {/* View Switcher: Questionnaire Form vs List */}
        {activeResponse && activeTemplate ? (
          <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold">{activeTemplate.template_title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Version: v{activeTemplate.version_number} • Status: <span className="font-semibold">{activeResponse.status}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveResponse(null);
                  setActiveTemplate(null);
                }}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
              >
                ← Back to List
              </button>
            </div>

            {/* Questions Form */}
            <div className="space-y-6">
              {activeTemplate.questions.map((q, idx) => (
                <div key={q.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    {idx + 1}. {q.question_text} {q.is_required && <span className="text-red-500">*</span>}
                  </label>

                  {/* Input Based on Question Type */}
                  {q.question_type === "TEXT" && (
                    <input
                      type="text"
                      disabled={activeResponse.status !== "DRAFT"}
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                    />
                  )}

                  {q.question_type === "LONG_TEXT" && (
                    <textarea
                      rows={3}
                      disabled={activeResponse.status !== "DRAFT"}
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                    />
                  )}

                  {(q.question_type === "NUMBER" || q.question_type === "CURRENCY") && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="any"
                        disabled={activeResponse.status !== "DRAFT"}
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className="block w-full md:w-64 px-3 py-2 border border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                      />
                      {q.units && <span className="text-sm text-gray-500 font-medium">{q.units}</span>}
                    </div>
                  )}

                  {q.question_type === "BOOLEAN" && (
                    <div className="flex items-center space-x-4 mt-2">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          disabled={activeResponse.status !== "DRAFT"}
                          checked={answers[q.id] === true}
                          onChange={() => setAnswers({ ...answers, [q.id]: true })}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Yes</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          disabled={activeResponse.status !== "DRAFT"}
                          checked={answers[q.id] === false}
                          onChange={() => setAnswers({ ...answers, [q.id]: false })}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">No</span>
                      </label>
                    </div>
                  )}

                  {q.question_type === "SINGLE_SELECT" && q.options && (
                    <select
                      disabled={activeResponse.status !== "DRAFT"}
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="block w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                    >
                      <option value="">-- Select an option --</option>
                      {q.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {/* Multiple Evidence Document Attachment */}
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                      Attach Evidence Document(s) {q.evidence_required && <span className="text-red-500 font-normal">(Required)</span>}
                    </p>
                    {vendorDocs.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No documents available. <Link href="/vendor/documents" className="text-blue-600 underline">Upload documents first</Link>.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {vendorDocs.map((doc) => {
                          const verId = doc.latest_version?.id;
                          if (!verId) return null;
                          const isAttached = (evidenceMap[q.id] || []).includes(verId);
                          return (
                            <label key={doc.id} className="flex items-center space-x-2 text-xs bg-white p-2 rounded border border-gray-200">
                              <input
                                type="checkbox"
                                disabled={activeResponse.status !== "DRAFT"}
                                checked={isAttached}
                                onChange={() => toggleEvidenceDoc(q.id, verId)}
                                className="text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{doc.document_type}: {doc.latest_version?.original_filename}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {activeResponse.status === "DRAFT" && (
              <div className="mt-8 flex justify-end space-x-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-sm font-medium"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(true)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
                >
                  {saving ? "Submitting..." : "Submit Questionnaire"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Available Templates */}
            <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
              <h2 className="text-lg font-bold mb-4">Available Questionnaires</h2>
              {templates.length === 0 ? (
                <p className="text-sm text-gray-500">No active questionnaire templates available at this time.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((tpl) => (
                    <div key={tpl.template_version_id} className="p-4 border border-gray-200 rounded-lg flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-gray-900">{tpl.template_title}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          v{tpl.version_number} • {tpl.questions.length} Questions
                        </p>
                      </div>
                      <button
                        onClick={() => handleStartQuestionnaire(tpl.template_version_id)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
                      >
                        Start / Fill
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Submissions */}
            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold">My Submissions ({responses.length})</h2>
              </div>
              {responses.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No questionnaire submissions found.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {responses.map((resp) => (
                      <tr key={resp.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                          {resp.id.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            resp.status === "SUBMITTED" ? "bg-green-100 text-green-800" :
                            resp.status === "EVALUATED" ? "bg-blue-100 text-blue-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {resp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {resp.created_at ? new Date(resp.created_at).toLocaleDateString() : ""}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => openResponse(resp.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {resp.status === "DRAFT" ? "Continue" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
