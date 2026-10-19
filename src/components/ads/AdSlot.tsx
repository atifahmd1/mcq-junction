"use client";

import React from "react";

export type AdPlacement =
  | "dashboard_feed"
  | "exams_feed"
  | "topic_feed"
  | "post_explanation"
  | "test_results";

interface AdSlotProps {
  placement: AdPlacement;
  slotId?: string;
  className?: string;
  /**
   * By default ads are disabled until an official publisher/ad provider is configured.
   * You can test the reserved slot visual rendering with forcePreview={true}.
   */
  forcePreview?: boolean;
}

// Global configuration toggle (default false for clean ad-free experience, ready for future ad enablement)
const ADS_GLOBALLY_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ADS === "true";

export function AdSlot({
  placement,
  slotId,
  className = "",
  forcePreview = false,
}: AdSlotProps) {
  // If ads are not enabled and not forced in preview mode, render nothing cleanly (no awkward empty gap)
  if (!ADS_GLOBALLY_ENABLED && !forcePreview) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="Sponsored advertisement"
      data-ad-placement={placement}
      data-ad-slot={slotId || `ad-${placement}`}
      className={`relative my-6 overflow-hidden rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4 text-center transition ${className}`}
    >
      {/* Required unambiguous Sponsored badge */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F34]/60">
        <span className="inline-flex items-center rounded-md bg-[#1D2125] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#717780]">
          Sponsored
        </span>
        <span className="text-[10px] text-[#717780]">Ad Placement</span>
      </div>

      {/* Content Container (Standard responsive dimensions) */}
      <div className="flex min-h-[90px] flex-col items-center justify-center p-3 text-xs text-[#A1A1AA]">
        <div className="flex items-center gap-2 text-[#717780]">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
          <span className="font-medium text-[#A1A1AA]">Premium Partner Space</span>
        </div>
        <p className="mt-1 text-[11px] text-[#717780]">
          Future reserved advertising placement. Ad-free for Pro subscribers.
        </p>
      </div>
    </aside>
  );
}

export default AdSlot;

