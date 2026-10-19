"use client";

// ============================================================================
// MCQ Junction — AI Studio: Question Paper Ingestion & MCQ Generation
// Visual Redesign: Minimalist Swiss Editorial × Restrained Neo-Tech (Screen 8)
// File: src/app/ai-studio/page.tsx
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";

interface BatchItem {
  id: string;
  name: string;
  language: string;
  type: string;
  questionsGenerated: number;
  status: "COMPLETED" | "PROCESSING" | "QUEUED";
  date: string;
}

export default function AiStudioPage() {
  const [activeTab, setActiveTab] = useState<"GENERATE" | "BATCHES">("GENERATE");
  const [paperLink, setPaperLink] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("Auto Detect");
  const [selectedType, setSelectedType] = useState("SINGLE_CORRECT");
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const batches: BatchItem[] = [
    {
      id: "batch-bpsc-70",
      name: "BPSC_70th_Prelims_General_Studies.pdf",
      language: "Hindi / English",
      type: "MCQ (Single Correct)",
      questionsGenerated: 150,
      status: "COMPLETED",
      date: "12 Oct 2026",
    },
    {
      id: "batch-tre-urdu",
      name: "Bihar_TRE_Urdu_Language_Paper.pdf",
      language: "Urdu (RTL)",
      type: "Comprehension & MCQs",
      questionsGenerated: 75,
      status: "COMPLETED",
      date: "11 Oct 2026",
    },
    {
      id: "batch-ctet-math",
      name: "CTET_Paper2_Mathematics_Pedagogy.pdf",
      language: "English / Bangla",
      type: "Assertion & Reason",
      questionsGenerated: 30,
      status: "COMPLETED",
      date: "09 Oct 2026",
    },
  ];

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && !paperLink.trim()) {
      return;
    }

    setIsProcessing(true);
    setSuccessMessage(null);

    // Simulated ingestion pipeline with live feedback
    setTimeout(() => {
      setIsProcessing(false);
      setSuccessMessage(
        `Successfully ingested question paper. 25 MCQs generated and verified under ${selectedLanguage} schema.`
      );
    }, 1500);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Breadcrumbs */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
          <Link href="/" className="hover:text-[#F1F2F3] transition">
            Home
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#D6B36A]">AI Studio</span>
        </nav>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F2F3]">
            AI Studio
          </h1>
          <span className="rounded-full bg-[#D6B36A]/15 border border-[#D6B36A]/30 px-3 py-1 text-xs font-semibold text-[#D6B36A]">
            OCR &bull; Vision &bull; Parser
          </span>
        </div>
        <p className="mt-1 text-xs sm:text-sm text-[#A1A1AA]">
          Upload question papers or paste document URLs to extract, normalize, and generate verified MCQs with multilingual support.
        </p>
      </div>

      {/* Tabs: Generate | My Batches (Screen 8) */}
      <div className="flex items-center gap-2 border-b border-[#2A2F34] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("GENERATE")}
          className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
            activeTab === "GENERATE"
              ? "bg-[#D6B36A] text-[#0B0D0F]"
              : "bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3]"
          }`}
        >
          Generate
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("BATCHES")}
          className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
            activeTab === "BATCHES"
              ? "bg-[#D6B36A] text-[#0B0D0F]"
              : "bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3]"
          }`}
        >
          My Batches ({batches.length})
        </button>
      </div>

      {activeTab === "GENERATE" ? (
        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Upload Dropzone Card (Screen 8) */}
          <div className="rounded-3xl border-2 border-dashed border-[#2A2F34] bg-[#171A1D] p-8 text-center transition hover:border-[#D6B36A]/60">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#111416] border border-[#2A2F34] text-[#D6B36A] shadow-inner">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>

            <h2 className="mt-4 text-base sm:text-lg font-bold text-[#F1F2F3]">
              Upload Question Paper (PDF / Image)
            </h2>
            <p className="mt-1 text-xs text-[#717780]">
              Supports Hindi, English, Urdu, Bangla with script preservation
            </p>

            <div className="mt-6 flex justify-center">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-[#D6B36A] px-6 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582] transition">
                <span>{selectedFile ? selectedFile.name : "Choose File"}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="h-px w-16 bg-[#2A2F34]" />
              <span className="text-xs uppercase text-[#717780]">or</span>
              <span className="h-px w-16 bg-[#2A2F34]" />
            </div>

            <div className="mt-4 mx-auto max-w-md">
              <div className="relative flex items-center">
                <input
                  type="url"
                  value={paperLink}
                  onChange={(e) => setPaperLink(e.target.value)}
                  placeholder="Paste link to question paper..."
                  className="w-full rounded-xl border border-[#2A2F34] bg-[#14171A] py-2.5 pl-4 pr-10 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-hidden"
                />
                <span className="absolute right-3 text-[#717780]">🔗</span>
              </div>
            </div>
          </div>

          {/* Ingestion Settings (Screen 8) */}
          <div className="rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#F1F2F3]">Extraction Settings</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#A1A1AA]">Target Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full rounded-xl border border-[#2A2F34] bg-[#14171A] px-3.5 py-2.5 text-xs font-semibold text-[#F1F2F3] focus:border-[#D6B36A] focus:outline-hidden"
                >
                  <option value="Auto Detect">Auto Detect</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi (Devanagari)</option>
                  <option value="Urdu">Urdu (Nastaliq RTL)</option>
                  <option value="Bangla">Bangla (Bengali)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#A1A1AA]">Question Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full rounded-xl border border-[#2A2F34] bg-[#14171A] px-3.5 py-2.5 text-xs font-semibold text-[#F1F2F3] focus:border-[#D6B36A] focus:outline-hidden"
                >
                  <option value="SINGLE_CORRECT">MCQ (Single Correct)</option>
                  <option value="MULTIPLE_CORRECT">Multiple Correct Options</option>
                  <option value="ASSERTION_REASON">Assertion &amp; Reason</option>
                  <option value="COMPREHENSION">Comprehension Passage Linked</option>
                </select>
              </div>
            </div>
          </div>

          {/* Feedback Message */}
          {successMessage && (
            <div className="rounded-2xl border border-[#22C55E]/40 bg-[#14281D] p-4 text-xs sm:text-sm text-[#22C55E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>✓</span>
                <span>{successMessage}</span>
              </div>
              <Link
                href="/learn"
                className="font-bold underline text-[#22C55E] hover:opacity-80"
              >
                Inspect MCQs &rarr;
              </Link>
            </div>
          )}

          {/* Primary Action Button (Screen 8) */}
          <button
            type="submit"
            disabled={isProcessing || (!selectedFile && !paperLink.trim())}
            className="w-full rounded-2xl bg-[#D6B36A] py-3.5 text-xs sm:text-sm font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] disabled:opacity-40"
          >
            {isProcessing ? "Processing Document & Extracting MCQs..." : "Generate Questions →"}
          </button>
        </form>
      ) : (
        /* Batches List */
        <div className="space-y-3">
          {batches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 sm:p-5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#F1F2F3]">{b.name}</h3>
                  <span className="rounded-md bg-[#22C55E]/15 border border-[#22C55E]/30 px-2 py-0.5 text-[10px] font-semibold text-[#22C55E]">
                    {b.status}
                  </span>
                </div>
                <div className="text-xs text-[#717780]">
                  {b.language} &bull; {b.type} &bull; {b.date}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold text-[#D6B36A]">
                  {b.questionsGenerated} MCQs
                </div>
                <Link
                  href="/learn"
                  className="text-xs text-[#A1A1AA] hover:text-[#F1F2F3] underline mt-0.5 inline-block"
                >
                  Review Questions
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
