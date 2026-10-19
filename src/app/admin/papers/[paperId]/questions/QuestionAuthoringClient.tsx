"use client";

// ============================================================================
// MCQ Junction — Question Authoring, Types & Import/Export Client Component
// File: src/app/admin/papers/[paperId]/questions/QuestionAuthoringClient.tsx
// ============================================================================

import React, { useState, useTransition } from "react";
import {
  saveQuestionAction,
  importQuestionsCsvAction,
  exportQuestionsCsvAction,
} from "../../../actions";

export interface QuestionOptionView {
  id: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
  explanationText?: string | null;
  conceptTitle?: string | null;
}

export interface QuestionViewItem {
  id: string;
  sequenceNumber: number;
  questionType: string;
  primarySubject: string;
  defaultTopic: string;
  canonicalRefCode: string;
  sectionTitle: string;
  questionText: string;
  overallExplanation?: string | null;
  passageRefCode?: string | null;
  passageTitle?: string | null;
  passageLanguage?: string | null;
  options: QuestionOptionView[];
  correctLabels: string[];
}

interface QuestionAuthoringClientProps {
  paperId: string;
  paperCode: string;
  isPublished: boolean;
  existingQuestions: QuestionViewItem[];
}

export default function QuestionAuthoringClient({
  paperId,
  paperCode,
  isPublished,
  existingQuestions,
}: QuestionAuthoringClientProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"LIST" | "NEW" | "IMPORT">("LIST");
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "SUCCESS" | "ERROR";
    text: string;
    details?: string[];
  } | null>(null);

  // New Question Form State
  const [questionType, setQuestionType] = useState<
    "SINGLE_CORRECT" | "MULTIPLE_CORRECT" | "ASSERTION_REASON" | "COMPREHENSION_CHILD"
  >("SINGLE_CORRECT");
  const [primarySubject, setPrimarySubject] = useState("");
  const [defaultTopic, setDefaultTopic] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [assertionText, setAssertionText] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [overallExplanation, setOverallExplanation] = useState("");

  // Passage state
  const [linkToPassage, setLinkToPassage] = useState(false);
  const [passageRefCode, setPassageRefCode] = useState("");
  const [passageTitle, setPassageTitle] = useState("");
  const [passageLanguage, setPassageLanguage] = useState<"EN" | "HI" | "UR" | "BN" | "TA" | "TE">("EN");
  const [passageBodyText, setPassageBodyText] = useState("");
  const [passageImageUrl, setPassageImageUrl] = useState("");
  const [passageImageAlt, setPassageImageAlt] = useState("");

  const [options, setOptions] = useState([
    { label: "A", text: "", isCorrect: true, explanation: "" },
    { label: "B", text: "", isCorrect: false, explanation: "" },
    { label: "C", text: "", isCorrect: false, explanation: "" },
    { label: "D", text: "", isCorrect: false, explanation: "" },
  ]);

  // CSV Import State
  const [csvContent, setCsvContent] = useState("");

  const handleOptionCorrectChange = (label: string, isChecked: boolean) => {
    if (questionType === "SINGLE_CORRECT" || questionType === "ASSERTION_REASON") {
      // Radio behavior: exactly one correct
      setOptions((prev) =>
        prev.map((opt) => ({
          ...opt,
          isCorrect: opt.label === label,
        }))
      );
    } else {
      // Checkbox behavior: multiple allowed
      setOptions((prev) =>
        prev.map((opt) => (opt.label === label ? { ...opt, isCorrect: isChecked } : opt))
      );
    }
  };

  const handleOptionTextChange = (label: string, text: string) => {
    setOptions((prev) =>
      prev.map((opt) => (opt.label === label ? { ...opt, text } : opt))
    );
  };

  const handleOptionExplanationChange = (label: string, explanation: string) => {
    setOptions((prev) =>
      prev.map((opt) => (opt.label === label ? { ...opt, explanation } : opt))
    );
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);

    // Frontend validations
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount === 0) {
      setFeedbackMessage({ type: "ERROR", text: "Please select at least one correct option." });
      return;
    }
    if ((questionType === "SINGLE_CORRECT" || questionType === "ASSERTION_REASON") && correctCount !== 1) {
      setFeedbackMessage({
        type: "ERROR",
        text: `Question type ${questionType} must have exactly one correct answer.`,
      });
      return;
    }

    startTransition(async () => {
      const payload = {
        paperId,
        questionType,
        primarySubject: primarySubject.trim(),
        defaultTopic: defaultTopic.trim(),
        questionText: questionText.trim(),
        assertionText: questionType === "ASSERTION_REASON" ? assertionText.trim() : undefined,
        reasonText: questionType === "ASSERTION_REASON" ? reasonText.trim() : undefined,
        overallExplanation: overallExplanation.trim() || undefined,
        passage:
          linkToPassage || questionType === "COMPREHENSION_CHILD"
            ? {
                passageRefCode: passageRefCode.trim(),
                passageTitle: passageTitle.trim() || undefined,
                passageLanguage,
                passageBodyText: passageBodyText.trim(),
                passageImageUrl: passageImageUrl.trim() || undefined,
                passageImageAlt: passageImageAlt.trim() || undefined,
              }
            : undefined,
        options: options.map((opt) => ({
          optionLabel: opt.label,
          optionText: opt.text.trim(),
          isCorrect: opt.isCorrect,
          explanationText: opt.explanation.trim() || undefined,
        })),
      };

      const res = await saveQuestionAction(payload);
      if (res.success) {
        setFeedbackMessage({
          type: "SUCCESS",
          text: `Question saved successfully (Sequence #${res.data?.sequenceNumber})!`,
        });
        // Reset form
        setQuestionText("");
        setAssertionText("");
        setReasonText("");
        setOverallExplanation("");
        setLinkToPassage(false);
        setPassageBodyText("");
        setPassageRefCode("");
        setOptions([
          { label: "A", text: "", isCorrect: true, explanation: "" },
          { label: "B", text: "", isCorrect: false, explanation: "" },
          { label: "C", text: "", isCorrect: false, explanation: "" },
          { label: "D", text: "", isCorrect: false, explanation: "" },
        ]);
        setActiveTab("LIST");
      } else {
        setFeedbackMessage({
          type: "ERROR",
          text: res.error || "Failed to save question",
        });
      }
    });
  };

  const handleImportCsv = () => {
    if (!csvContent.trim()) {
      setFeedbackMessage({ type: "ERROR", text: "Please paste CSV content before importing." });
      return;
    }

    setFeedbackMessage(null);

    startTransition(async () => {
      const res = await importQuestionsCsvAction(paperId, csvContent);
      if (res.success) {
        setFeedbackMessage({
          type: "SUCCESS",
          text: `Successfully imported ${res.data?.importedCount} questions!`,
        });
        setCsvContent("");
        setActiveTab("LIST");
      } else {
        const errorDetails = res.data?.errors?.map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`);
        setFeedbackMessage({
          type: "ERROR",
          text: res.error || "CSV Import Failed",
          details: errorDetails,
        });
      }
    });
  };

  const handleExportCsv = () => {
    startTransition(async () => {
      const res = await exportQuestionsCsvAction(paperId);
      if (res.success && res.data?.csv) {
        const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${paperCode}_questions.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        setFeedbackMessage({
          type: "ERROR",
          text: res.error || "Failed to export CSV",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`rounded-xl border p-4 ${
            feedbackMessage.type === "SUCCESS"
              ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
              : "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]"
          }`}
        >
          <p className="font-semibold text-xs sm:text-sm">{feedbackMessage.text}</p>
          {feedbackMessage.details && feedbackMessage.details.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs space-y-1">
              {feedbackMessage.details.map((det, i) => (
                <li key={i}>{det}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action Bar & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2F34] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("LIST")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "LIST"
                ? "bg-[#D6B36A] text-[#0B0D0F]"
                : "border border-[#2A2F34] bg-[#171A1D] text-[#A1A1AA] hover:text-[#F1F2F3]"
            }`}
          >
            Questions List ({existingQuestions.length})
          </button>
          {!isPublished && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("NEW")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "NEW"
                    ? "bg-[#D6B36A] text-[#0B0D0F]"
                    : "border border-[#2A2F34] bg-[#171A1D] text-[#A1A1AA] hover:text-[#F1F2F3]"
                }`}
              >
                + Author Question
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("IMPORT")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "IMPORT"
                    ? "bg-[#D6B36A] text-[#0B0D0F]"
                    : "border border-[#2A2F34] bg-[#171A1D] text-[#A1A1AA] hover:text-[#F1F2F3]"
                }`}
              >
                Import CSV
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isPending || existingQuestions.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-1.5 text-xs font-semibold text-[#F1F2F3] hover:bg-[#1D2125] hover:border-[#D6B36A]/50 disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* TAB 1: Existing Questions List */}
      {activeTab === "LIST" && (
        <div className="space-y-4">
          {existingQuestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#2A2F34] bg-[#111416] p-10 text-center text-xs text-[#717780]">
              No questions found in this paper yet. Author one or import via CSV.
            </div>
          ) : (
            existingQuestions.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2F34] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#171A1D] border border-[#2A2F34] px-2 py-0.5 text-xs font-bold font-mono text-[#D6B36A]">
                      #{q.sequenceNumber}
                    </span>
                    <span className="rounded-md bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-2 py-0.5 text-xs font-mono font-semibold text-[#D6B36A]">
                      {q.questionType}
                    </span>
                    {q.passageRefCode && (
                      <span className="rounded-md bg-[#171A1D] border border-[#2A2F34] px-2 py-0.5 text-xs font-mono text-[#A1A1AA]">
                        📖 Passage: {q.passageTitle ? `${q.passageTitle} (${q.passageRefCode})` : q.passageRefCode}
                        {q.passageLanguage && ` • ${q.passageLanguage}`}
                      </span>
                    )}
                    <span className="text-xs text-[#717780]">
                      {q.primarySubject} &bull; {q.defaultTopic}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#717780]">{q.canonicalRefCode}</span>
                </div>

                <p className="text-xs sm:text-sm font-medium text-[#F1F2F3] whitespace-pre-line">
                  {q.questionText}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {q.options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs ${
                        opt.isCorrect
                          ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#F1F2F3]"
                          : "border-[#2A2F34] bg-[#171A1D] text-[#A1A1AA]"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-bold font-mono text-xs ${
                          opt.isCorrect
                            ? "bg-[#22C55E] text-[#0B0D0F]"
                            : "bg-[#2A2F34] text-[#A1A1AA]"
                        }`}
                      >
                        {opt.optionLabel}
                      </span>
                      <div className="flex-1">
                        <span>{opt.optionText}</span>
                        {opt.explanationText && (
                          <p className="mt-1 text-[11px] text-[#717780] italic">
                            {opt.explanationText}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Author New Question */}
      {activeTab === "NEW" && !isPublished && (
        <form onSubmit={handleSaveQuestion} className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 space-y-5">
          <h2 className="text-base sm:text-lg font-bold text-[#F1F2F3]">Author Question</h2>

          {/* Question Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
              Question Type (Explicit)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { type: "SINGLE_CORRECT", label: "Single Correct", desc: "Exactly 1 option is correct" },
                { type: "MULTIPLE_CORRECT", label: "Multiple Correct", desc: "1 or more options correct (All-or-Nothing)" },
                { type: "ASSERTION_REASON", label: "Assertion & Reason", desc: "Assertion + Reason statements" },
                { type: "COMPREHENSION_CHILD", label: "Comprehension Child", desc: "Linked question in a shared reading passage" },
              ].map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    const newType = t.type as typeof questionType;
                    setQuestionType(newType);
                    if (newType === "COMPREHENSION_CHILD") {
                      setLinkToPassage(true);
                    }
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    questionType === t.type
                      ? "border-[#D6B36A] bg-[#D6B36A]/10 ring-1 ring-[#D6B36A]"
                      : "border-[#2A2F34] bg-[#171A1D] hover:bg-[#1D2125]"
                  }`}
                >
                  <p className="text-xs font-bold text-[#F1F2F3]">{t.label}</p>
                  <p className="mt-1 text-[11px] text-[#717780]">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subject & Topic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                Primary Subject
              </label>
              <input
                type="text"
                value={primarySubject}
                onChange={(e) => setPrimarySubject(e.target.value)}
                placeholder="e.g. Database Management Systems"
                required
                className="w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                Default Topic
              </label>
              <input
                type="text"
                value={defaultTopic}
                onChange={(e) => setDefaultTopic(e.target.value)}
                placeholder="e.g. Relational Invariants & ACID"
                required
                className="w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
              />
            </div>
          </div>

          {/* Passage Association Section */}
          <div className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkToPassage || questionType === "COMPREHENSION_CHILD"}
                  onChange={(e) => setLinkToPassage(e.target.checked)}
                  disabled={questionType === "COMPREHENSION_CHILD"}
                  className="h-4 w-4 accent-[#D6B36A] rounded"
                />
                <span className="text-xs font-bold text-[#F1F2F3]">
                  {questionType === "COMPREHENSION_CHILD"
                    ? "Comprehension Passage Association (Mandatory)"
                    : "Associate with Comprehension Passage (Optional)"}
                </span>
              </label>
              {passageLanguage === "UR" && (
                <span className="text-[11px] font-semibold text-[#D6B36A] bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-2 py-0.5 rounded">
                  RTL layout enabled for Urdu
                </span>
              )}
            </div>

            {(linkToPassage || questionType === "COMPREHENSION_CHILD") && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                      Passage Ref Code *
                    </label>
                    <input
                      type="text"
                      value={passageRefCode}
                      onChange={(e) => setPassageRefCode(e.target.value)}
                      placeholder="e.g. PASSAGE-GATE-CS-01"
                      required={linkToPassage || questionType === "COMPREHENSION_CHILD"}
                      className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs font-mono text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                      Passage Title (Optional)
                    </label>
                    <input
                      type="text"
                      value={passageTitle}
                      onChange={(e) => setPassageTitle(e.target.value)}
                      placeholder="e.g. Distributed Consensus & CAP"
                      className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                      Language
                    </label>
                    <select
                      value={passageLanguage}
                      onChange={(e) => setPassageLanguage(e.target.value as typeof passageLanguage)}
                      className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs text-[#F1F2F3] focus:border-[#D6B36A] focus:outline-none"
                    >
                      <option value="EN">English (EN)</option>
                      <option value="HI">Hindi (HI)</option>
                      <option value="UR">Urdu (UR — RTL)</option>
                      <option value="BN">Bangla (BN)</option>
                      <option value="TA">Tamil (TA)</option>
                      <option value="TE">Telugu (TE)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                    Passage Body Text *
                  </label>
                  <textarea
                    rows={4}
                    value={passageBodyText}
                    onChange={(e) => setPassageBodyText(e.target.value)}
                    dir={passageLanguage === "UR" ? "rtl" : "ltr"}
                    placeholder={
                      passageLanguage === "UR"
                        ? "عبارت کا متن یہاں درج کریں..."
                        : "Enter the shared reading comprehension passage text..."
                    }
                    required={linkToPassage || questionType === "COMPREHENSION_CHILD"}
                    className={`w-full rounded-lg border border-[#2A2F34] bg-[#111416] p-2.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none ${
                      passageLanguage === "UR" ? "font-serif text-sm" : ""
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                      Passage Image URL (Optional, HTTPS or /assets only)
                    </label>
                    <input
                      type="url"
                      value={passageImageUrl}
                      onChange={(e) => setPassageImageUrl(e.target.value)}
                      placeholder="https://... or /assets/diagram.png"
                      className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
                      Passage Image Alt Text
                    </label>
                    <input
                      type="text"
                      value={passageImageAlt}
                      onChange={(e) => setPassageImageAlt(e.target.value)}
                      placeholder="Accessible diagram description"
                      className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* If ASSERTION_REASON, render explicit Assertion and Reason fields */}
          {questionType === "ASSERTION_REASON" && (
            <div className="space-y-4 rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4">
              <div>
                <label className="block text-xs font-bold text-[#D6B36A] mb-1">
                  Assertion (A) Statement
                </label>
                <textarea
                  rows={2}
                  value={assertionText}
                  onChange={(e) => setAssertionText(e.target.value)}
                  placeholder="Enter the Assertion (A) proposition..."
                  required
                  className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] p-2.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#D6B36A] mb-1">
                  Reason (R) Statement
                </label>
                <textarea
                  rows={2}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Enter the Reason (R) explanation statement..."
                  required
                  className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] p-2.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Question Text / Prompt */}
          <div>
            <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
              Question Prompt Text
            </label>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question prompt text..."
              required
              className="w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] p-3 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
            />
          </div>

          {/* Options Configuration */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[#A1A1AA]">
              Answer Options & Correct Key Configuration
            </label>
            <div className="space-y-3">
              {options.map((opt) => (
                <div
                  key={opt.label}
                  className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-3 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
                      <input
                        type={questionType === "MULTIPLE_CORRECT" ? "checkbox" : "radio"}
                        name="correct-option"
                        checked={opt.isCorrect}
                        onChange={(e) => handleOptionCorrectChange(opt.label, e.target.checked)}
                        className="h-4 w-4 accent-[#22C55E]"
                      />
                      <span className="font-mono text-[#D6B36A]">Option {opt.label}</span>
                    </label>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionTextChange(opt.label, e.target.value)}
                      placeholder={`Option ${opt.label} text`}
                      className="flex-1 rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={opt.explanation}
                    onChange={(e) => handleOptionExplanationChange(opt.label, e.target.value)}
                    placeholder={`Short explanation for option ${opt.label} (optional)`}
                    className="w-full rounded-lg border border-[#2A2F34] bg-[#111416] px-3 py-1 text-[11px] text-[#A1A1AA] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Overall Explanation */}
          <div>
            <label className="block text-xs font-semibold text-[#A1A1AA] mb-1">
              Overall Explanation (Optional)
            </label>
            <textarea
              rows={2}
              value={overallExplanation}
              onChange={(e) => setOverallExplanation(e.target.value)}
              placeholder="Detailed explanation of the solution..."
              className="w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] p-2.5 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
            />
          </div>

          {/* Submit Action */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("LIST")}
              className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-[#D6B36A] px-5 py-2 text-xs font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] disabled:opacity-50"
            >
              {isPending ? "Validating & Saving..." : "Save Question"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: CSV Import */}
      {activeTab === "IMPORT" && !isPublished && (
        <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#F1F2F3]">
              Bulk CSV Question Import
            </h2>
            <p className="mt-1 text-xs text-[#717780]">
              Paste standard CSV rows with columns:{" "}
              <code className="text-[#D6B36A] font-mono break-all text-[11px]">
                sequence_number,question_type,canonical_ref_code,primary_subject,default_topic,question_text,assertion_text,reason_text,passage_ref_code,passage_title,passage_body_text,passage_language,passage_image_url,option_a,option_b,option_c,option_d,option_e,correct_answers,overall_explanation
              </code>
            </p>
          </div>

          <textarea
            rows={10}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder={`question_type,primary_subject,default_topic,question_text,passage_ref_code,passage_title,passage_body_text,passage_language,option_a,option_b,option_c,option_d,correct_answers\nSINGLE_CORRECT,DBMS,Indexing,What is B-Tree depth?,,,,,O(log n),O(n),O(1),O(n^2),A\nMULTIPLE_CORRECT,DBMS,ACID,Which are ACID properties?,,,,,Atomicity,Asynchrony,Isolation,Durability,"A,C,D"\nCOMPREHENSION_CHILD,DBMS,CAP,Which theorem is described?,PASS-01,CAP Review,In distributed systems Brewer postulated...,EN,CAP Theorem,FLMP,Two-Phase,Paxos,A`}
            className="w-full font-mono text-xs rounded-xl border border-[#2A2F34] bg-[#171A1D] p-3 text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("LIST")}
              className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportCsv}
              disabled={isPending || !csvContent.trim()}
              className="rounded-lg bg-[#D6B36A] px-5 py-2 text-xs font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] disabled:opacity-50"
            >
              {isPending ? "Validating & Importing..." : "Validate & Import CSV"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
