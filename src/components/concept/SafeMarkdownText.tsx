"use client";

// ============================================================================
// MCQ Junction — Safe Rich Text / Markdown Renderer (Zero Arbitrary HTML)
// File: src/components/concept/SafeMarkdownText.tsx
// ============================================================================

import React from "react";

interface SafeMarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Parses inline formatting like **bold**, *italic*, and `code` safely into React nodes.
 * Eliminates all XSS / raw HTML injection vulnerabilities.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex to match **bold**, *italic*, and `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className="italic text-zinc-800 dark:text-zinc-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-indigo-700 dark:bg-zinc-800 dark:text-indigo-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Renders paragraphs, headings, and bullet points without dangerouslySetInnerHTML.
 */
export function SafeMarkdownText({ content, className = "" }: SafeMarkdownTextProps) {
  if (!content) return null;

  // Split into blocks by double newlines or single newlines with list bullets
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];

  let currentListItems: string[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="my-3 space-y-1.5 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {currentListItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // List item check (- or * or numbered)
    if (/^[-*•]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*•]\s+/, "");
      currentListItems.push(itemText);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^\d+\.\s+/, "");
      currentListItems.push(itemText);
      continue;
    }

    flushList();

    // Heading checks
    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h4 key={`h4-${blocks.length}`} className="mt-4 mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith("## ")) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-5 mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-2.5 text-sm sm:text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {renderInlineFormatting(trimmed)}
        </p>
      );
    }
  }

  flushList();

  return <div className={`space-y-1 ${className}`}>{blocks}</div>;
}
