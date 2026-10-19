"use client";

// ============================================================================
// MCQ Junction — Detailed Concept Modal
// File: src/components/concept/DetailedConceptModal.tsx
// ============================================================================

import React, { useEffect, useRef, useState, useCallback, useId } from "react";
import { DetailedConceptData, ConceptReference } from "@/types/concept";
import {
  isSafeImageUrl,
  parseVideoUrl,
  sanitizeExternalUrl,
} from "@/lib/concept/url-validator";
import { SafeMarkdownText } from "./SafeMarkdownText";

export interface DetailedConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: DetailedConceptData | null;
  optionLabel?: string;
  isCorrect?: boolean | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type MediaTab = "image" | "video" | "references";

export function DetailedConceptModal({
  isOpen,
  onClose,
  concept,
  optionLabel,
  isCorrect,
  triggerRef,
}: DetailedConceptModalProps) {
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // User-selected tab state
  const [selectedTab, setSelectedTab] = useState<MediaTab>("image");
  const [imageExpanded, setImageExpanded] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);
  const [videoLoading, setVideoLoading] = useState<boolean>(true);
  const [videoError, setVideoError] = useState<boolean>(false);

  // Mobile Accordion state
  const [mobileKeyPointsOpen, setMobileKeyPointsOpen] = useState<boolean>(true);
  const [mobileReferencesOpen, setMobileReferencesOpen] = useState<boolean>(false);

  // Track the previous active element to restore focus on close
  const previousActiveElement = useRef<Element | null>(null);

  // Determine media availability
  const hasValidImage = Boolean(concept?.imageUrl && isSafeImageUrl(concept.imageUrl));
  const videoResult = concept?.videoUrl ? parseVideoUrl(concept.videoUrl) : null;
  const hasValidVideo = Boolean(videoResult && videoResult.isValid);

  const validReferences = (concept?.references || []).filter(
    (ref): ref is ConceptReference => Boolean(ref.title && sanitizeExternalUrl(ref.url))
  );
  const hasValidReferences = validReferences.length > 0;

  const availableTabs: MediaTab[] = [];
  if (hasValidImage) availableTabs.push("image");
  if (hasValidVideo) availableTabs.push("video");
  if (hasValidReferences) availableTabs.push("references");

  // Derived current tab without effect-based setState
  const activeTab: MediaTab = availableTabs.includes(selectedTab)
    ? selectedTab
    : availableTabs[0] || "image";

  const hasMediaSection = availableTabs.length > 0;
  const hasKeyPoints = Array.isArray(concept?.keyPoints) && concept.keyPoints.length > 0;

  // Handle focus entry and restoration
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = triggerRef?.current ?? document.activeElement;

      // Lock body scroll while preserving current scroll offset
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Focus close button on next tick
      const timer = setTimeout(() => {
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        } else if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
      };
    } else {
      // Restore focus
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    }
  }, [isOpen, triggerRef]);

  // Global Escape key listener for robust keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isOpen, onClose]);

  // Focus trap & Tab key listener
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [onClose]
  );

  // Tab Keyboard Navigation (ArrowLeft / ArrowRight)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (availableTabs.length <= 1) return;
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % availableTabs.length;
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
      e.preventDefault();
    } else if (e.key === "Home") {
      nextIndex = 0;
      e.preventDefault();
    } else if (e.key === "End") {
      nextIndex = availableTabs.length - 1;
      e.preventDefault();
    }

    if (nextIndex !== currentIndex) {
      const nextTab = availableTabs[nextIndex];
      setSelectedTab(nextTab);
      const tabButton = modalRef.current?.querySelector<HTMLButtonElement>(`#tab-${nextTab}`);
      tabButton?.focus();
    }
  };

  // If not open or no concept content, do NOT render an empty modal
  if (!isOpen || !concept || (!concept.title && !concept.content)) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-[#0B0D0F]/80 backdrop-blur-md transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        data-testid="detailed-concept-modal"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl border border-[#2A2F34] bg-[#171A1D] shadow-2xl overflow-hidden focus:outline-hidden motion-reduce:transition-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2A2F34] px-5 sm:px-8 py-4 bg-[#111416] shrink-0">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {isCorrect === true ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#22C55E]/15 px-3 py-1 text-xs font-semibold text-[#22C55E] border border-[#22C55E]/30">
                <svg
                  className="h-3.5 w-3.5 fill-current shrink-0"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Correct Answer</span>
              </span>
            ) : isCorrect === false ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F87171]/15 px-3 py-1 text-xs font-semibold text-[#F87171] border border-[#F87171]/30">
                <svg
                  className="h-3.5 w-3.5 fill-current shrink-0"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{optionLabel ? `Option ${optionLabel} (Distractor)` : "Incorrect Option"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D6B36A]/15 px-3 py-1 text-xs font-semibold text-[#D6B36A] border border-[#D6B36A]/30">
                <span>{optionLabel ? `Option ${optionLabel} Concept` : "Concept Details"}</span>
              </span>
            )}
          </div>

          {/* Close Button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close concept details modal"
            className="rounded-lg p-2 text-[#717780] hover:bg-[#2A2F34] hover:text-[#F1F2F3] transition focus:outline-hidden focus:ring-2 focus:ring-[#D6B36A]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div key={concept.id} className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">

          <div
            className={`grid grid-cols-1 ${
              hasMediaSection ? "lg:grid-cols-12 gap-8" : "max-w-3xl mx-auto"
            }`}
          >
            {/* Primary Left Column: Title, Detailed Explanation, Key Points */}
            <div className={hasMediaSection ? "lg:col-span-7 space-y-6" : "space-y-6"}>
              {/* Concept Title */}
              <h2
                id={titleId}
                className="text-xl sm:text-2xl font-bold tracking-tight text-[#F1F2F3] leading-snug"
              >
                {concept.title}
              </h2>

              {/* Detailed Explanation Text */}
              <div id={descId} className="text-[#A1A1AA] text-sm sm:text-base leading-relaxed space-y-3">
                <SafeMarkdownText content={concept.content} />
              </div>

              {/* Desktop Key Points / Takeaways Section */}
              {hasKeyPoints && (
                <div className="hidden lg:block rounded-2xl border border-[#D6B36A]/25 bg-[#231E14]/40 p-5 shadow-xs">
                  <div className="flex items-center gap-2 mb-3 text-[#D6B36A] font-semibold text-sm sm:text-base">
                    <svg className="h-5 w-5 shrink-0 text-[#D6B36A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span>Key Concepts &amp; Principles</span>
                  </div>
                  <ul className="space-y-2 list-disc pl-5 text-xs sm:text-sm text-[#F1F2F3] leading-relaxed">
                    {concept.keyPoints!.map((point, idx) => (
                      <li key={idx} className="marker:text-[#D6B36A]">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Desktop References Section */}
              {hasValidReferences && activeTab === "image" && (
                <div className="hidden lg:block pt-4 border-t border-[#2A2F34]">
                  <div className="flex items-center gap-2 mb-3 text-[#F1F2F3] font-semibold text-sm">
                    <svg className="h-4 w-4 text-[#717780]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span>Verified References</span>
                  </div>
                  <ol className="space-y-2 list-decimal pl-5 text-xs sm:text-sm text-[#A1A1AA]">
                    {validReferences.map((ref, idx) => (
                      <li key={idx}>
                        <a
                          href={sanitizeExternalUrl(ref.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${ref.title} (opens in a new tab)`}
                          className="text-[#D6B36A] hover:text-[#E4C582] hover:underline inline-flex items-center gap-1 font-medium transition"
                        >
                          <span>{ref.title}</span>
                          <span aria-hidden="true" className="text-xs">↗</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Right Column / Mobile Media: Tabbed Media Section (Image / Video / References) */}
            {hasMediaSection && (
              <div className="lg:col-span-5 space-y-4">
                {/* Media Tabs Header */}
                <div
                  role="tablist"
                  aria-label="Concept media options"
                  className="flex items-center gap-1 border-b border-[#2A2F34] pb-1"
                >
                  {availableTabs.map((tab, idx) => {
                    const isActive = activeTab === tab;
                    const label =
                      tab === "image" ? "Image" : tab === "video" ? "Video" : "References";

                    return (
                      <button
                        key={tab}
                        id={`tab-${tab}`}
                        role="tab"
                        type="button"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => setSelectedTab(tab)}
                        onKeyDown={(e) => handleTabKeyDown(e, idx)}
                        className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition border-b-2 -mb-1.5 focus:outline-hidden focus:ring-2 focus:ring-[#D6B36A] ${
                          isActive
                            ? "border-[#D6B36A] text-[#D6B36A] font-semibold"
                            : "border-transparent text-[#717780] hover:text-[#F1F2F3]"
                        }`}
                      >
                        {label}
                        {tab === "references" && ` (${validReferences.length})`}
                      </button>
                    );
                  })}
                </div>


                {/* Tab Panel: Image */}
                {hasValidImage && (
                  <div
                    id="tabpanel-image"
                    role="tabpanel"
                    aria-labelledby="tab-image"
                    tabIndex={0}
                    hidden={activeTab !== "image"}
                    className="focus:outline-hidden"
                  >
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-850">
                      {concept.imageCaption && (
                        <div className="mb-2 font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 text-center">
                          {concept.imageCaption}
                        </div>
                      )}

                      <div className="relative overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800 min-h-[180px] flex items-center justify-center">
                        {imageLoading && !imageError && (
                          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse">
                            <span className="text-xs text-zinc-400">Loading educational illustration...</span>
                          </div>
                        )}

                        {imageError ? (
                          <div className="p-6 text-center text-zinc-500 dark:text-zinc-400 text-xs">
                            <svg className="mx-auto h-8 w-8 text-zinc-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Unable to load illustration image.</span>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={concept.imageUrl!}
                            alt={concept.imageAlt || concept.title}
                            onLoad={() => setImageLoading(false)}
                            onError={() => {
                              setImageLoading(false);
                              setImageError(true);
                            }}
                            className={`w-full max-h-[340px] object-contain transition-opacity duration-200 ${
                              imageLoading ? "opacity-0" : "opacity-100"
                            }`}
                          />
                        )}

                        {!imageError && !imageLoading && (
                          <button
                            type="button"
                            onClick={() => setImageExpanded(!imageExpanded)}
                            aria-label={imageExpanded ? "Minimize image" : "Expand image"}
                            className="absolute bottom-2 right-2 rounded-lg bg-zinc-900/70 p-1.5 text-white hover:bg-zinc-900 transition backdrop-blur-xs"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {concept.imageAlt && (
                        <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400 italic">
                          {concept.imageAlt}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab Panel: Video */}
                {hasValidVideo && (
                  <div
                    id="tabpanel-video"
                    role="tabpanel"
                    aria-labelledby="tab-video"
                    tabIndex={0}
                    hidden={activeTab !== "video"}
                    className="focus:outline-hidden"
                  >
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-850">
                      {concept.videoTitle && (
                        <div className="mb-2 font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                          {concept.videoTitle}
                        </div>
                      )}

                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-900 flex items-center justify-center">
                        {videoLoading && !videoError && (
                          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-400 text-xs animate-pulse">
                            Loading video player...
                          </div>
                        )}

                        {videoError ? (
                          <div className="p-6 text-center text-zinc-400 text-xs">
                            <svg className="mx-auto h-8 w-8 text-zinc-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Video playback unavailable.</span>
                          </div>
                        ) : videoResult?.provider === "direct" ? (
                          <video
                            controls
                            className="w-full h-full object-contain"
                            onLoadedData={() => setVideoLoading(false)}
                            onError={() => {
                              setVideoLoading(false);
                              setVideoError(true);
                            }}
                          >
                            <source src={videoResult.directUrl} />
                            Your browser does not support the video tag.
                          </video>
                        ) : videoResult?.embedUrl ? (
                          <iframe
                            src={videoResult.embedUrl}
                            title={concept.videoTitle || `${concept.title} educational video`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            onLoad={() => setVideoLoading(false)}
                            onError={() => {
                              setVideoLoading(false);
                              setVideoError(true);
                            }}
                            className="w-full h-full border-0"
                          />
                        ) : (
                          <div className="text-xs text-zinc-400 p-4 text-center">
                            Unsupported video source format.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab Panel: References */}
                {hasValidReferences && (
                  <div
                    id="tabpanel-references"
                    role="tabpanel"
                    aria-labelledby="tab-references"
                    tabIndex={0}
                    hidden={activeTab !== "references"}
                    className="focus:outline-hidden"
                  >
                    <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4 space-y-3">
                      <div className="font-semibold text-xs sm:text-sm text-[#F1F2F3] flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#D6B36A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>Verified Citations &amp; References</span>
                      </div>

                      <div className="space-y-2">
                        {validReferences.map((ref, idx) => {
                          const safeUrl = sanitizeExternalUrl(ref.url);
                          if (!safeUrl) return null;

                          let domain = "";
                          try {
                            domain = new URL(safeUrl).hostname;
                          } catch {
                            domain = safeUrl;
                          }

                          return (
                            <a
                              key={idx}
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${ref.title} (opens in a new tab)`}
                              className="group block rounded-xl border border-[#2A2F34] bg-[#171A1D] p-3.5 hover:border-[#D6B36A]/50 hover:shadow-xs transition"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="text-xs sm:text-sm font-medium text-[#F1F2F3] group-hover:text-[#D6B36A] transition">
                                    {ref.title}
                                  </div>
                                  <div className="text-[11px] text-[#717780] font-mono">
                                    {domain}
                                  </div>
                                </div>
                                <svg
                                  className="h-4 w-4 shrink-0 text-[#717780] group-hover:text-[#D6B36A] transition mt-0.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mobile Accordion: Key Points (lg:hidden) */}
                {hasKeyPoints && (
                  <div className="lg:hidden rounded-2xl border border-[#D6B36A]/25 bg-[#231E14]/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMobileKeyPointsOpen(!mobileKeyPointsOpen)}
                      className="w-full flex items-center justify-between p-4 text-left font-semibold text-xs sm:text-sm text-[#F1F2F3]"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-[#D6B36A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>Key Points</span>
                      </div>
                      <svg
                        className={`h-4 w-4 text-[#D6B36A] transition-transform ${mobileKeyPointsOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {mobileKeyPointsOpen && (
                      <div className="px-4 pb-4 pt-1 border-t border-[#2A2F34]">
                        <ul className="space-y-1.5 list-disc pl-5 text-xs text-[#A1A1AA] leading-relaxed">
                          {concept.keyPoints!.map((point, idx) => (
                            <li key={idx} className="marker:text-[#D6B36A]">
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile Accordion: References (lg:hidden, when activeTab is not references) */}
                {hasValidReferences && activeTab !== "references" && (
                  <div className="lg:hidden rounded-2xl border border-[#2A2F34] bg-[#14171A] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMobileReferencesOpen(!mobileReferencesOpen)}
                      className="w-full flex items-center justify-between p-4 text-left font-semibold text-xs sm:text-sm text-[#F1F2F3]"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-[#717780]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span>References ({validReferences.length})</span>
                      </div>
                      <svg
                        className={`h-4 w-4 text-[#717780] transition-transform ${mobileReferencesOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {mobileReferencesOpen && (
                      <div className="px-4 pb-4 pt-1 space-y-2 border-t border-[#2A2F34]">
                        {validReferences.map((ref, idx) => (
                          <a
                            key={idx}
                            href={sanitizeExternalUrl(ref.url)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${ref.title} (opens in a new tab)`}
                            className="block rounded-lg border border-[#2A2F34] bg-[#171A1D] p-2.5 text-xs text-[#D6B36A] hover:underline"
                          >
                            {ref.title} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Dismiss Action */}
        <div className="border-t border-[#2A2F34] px-5 sm:px-8 py-3.5 bg-[#111416] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#2A2F34] bg-[#1D2125] px-4 py-2 text-xs sm:text-sm font-semibold text-[#F1F2F3] shadow-xs hover:bg-[#2A2F34] transition focus:outline-hidden focus:ring-2 focus:ring-[#D6B36A]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
