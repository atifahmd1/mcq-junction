// ============================================================================
// MCQ Junction — CSV / XLSX-Compatible Question Import & Export Pipeline
// File: src/lib/questions/import-export.ts
// ============================================================================

import { validateQuestionConfiguration } from "./validation.ts";
import type { QuestionAuthoringPayload, SupportedQuestionType } from "./types.ts";

export interface QuestionExportRow {
  sequenceNumber: number;
  questionType: SupportedQuestionType;
  canonicalRefCode?: string | null;
  primarySubject: string;
  defaultTopic: string;
  passageRefCode?: string | null;
  passageTitle?: string | null;
  passageBodyText?: string | null;
  passageLanguage?: string | null;
  passageImageUrl?: string | null;
  passageImageAlt?: string | null;
  questionText: string;
  assertionText?: string | null;
  reasonText?: string | null;
  optionA: string;
  optionB: string;
  optionC?: string | null;
  optionD?: string | null;
  optionE?: string | null;
  correctAnswers: string; // e.g. "A" or "B,D"
  overallExplanation?: string | null;
  marksOverride?: number | null;
  negativeMarksOverride?: number | null;
}

export interface CsvImportRowError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  validQuestions: QuestionAuthoringPayload[];
  errors: CsvImportRowError[];
}

/**
 * Escapes a single CSV cell according to RFC 4180 standard.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Standard CSV Header columns for Question import/export.
 */
export const CSV_HEADERS = [
  "sequence_number",
  "question_type",
  "canonical_ref_code",
  "primary_subject",
  "default_topic",
  "passage_ref_code",
  "passage_title",
  "passage_body_text",
  "passage_language",
  "passage_image_url",
  "passage_image_alt",
  "question_text",
  "assertion_text",
  "reason_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct_answers",
  "overall_explanation",
  "marks_override",
  "negative_marks_override",
];

/**
 * Serializes an array of question export rows into RFC 4180 compliant CSV with UTF-8 BOM.
 */
export function serializeQuestionsToCsv(rows: QuestionExportRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];

  for (const row of rows) {
    const cells = [
      escapeCsvCell(row.sequenceNumber),
      escapeCsvCell(row.questionType),
      escapeCsvCell(row.canonicalRefCode || ""),
      escapeCsvCell(row.primarySubject),
      escapeCsvCell(row.defaultTopic),
      escapeCsvCell(row.passageRefCode || ""),
      escapeCsvCell(row.passageTitle || ""),
      escapeCsvCell(row.passageBodyText || ""),
      escapeCsvCell(row.passageLanguage || ""),
      escapeCsvCell(row.passageImageUrl || ""),
      escapeCsvCell(row.passageImageAlt || ""),
      escapeCsvCell(row.questionText),
      escapeCsvCell(row.assertionText || ""),
      escapeCsvCell(row.reasonText || ""),
      escapeCsvCell(row.optionA),
      escapeCsvCell(row.optionB),
      escapeCsvCell(row.optionC || ""),
      escapeCsvCell(row.optionD || ""),
      escapeCsvCell(row.optionE || ""),
      escapeCsvCell(row.correctAnswers),
      escapeCsvCell(row.overallExplanation || ""),
      escapeCsvCell(row.marksOverride ?? ""),
      escapeCsvCell(row.negativeMarksOverride ?? ""),
    ];
    lines.push(cells.join(","));
  }

  // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens Unicode text cleanly
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * Robust RFC 4180 CSV parser that properly handles multiline cells, quotes, commas, CRLF.
 */
export function parseCsvRows(csvContent: string): string[][] {
  const content = csvContent.replace(/^\uFEFF/, ""); // Remove BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < content.length && content[i + 1] === "\n") {
          i++; // skip LF after CR
        }
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses and validates questions from CSV text for a target exam paper.
 */
export function parseQuestionsFromCsv(
  csvContent: string,
  targetPaperId: string
): CsvImportResult {
  const parsedRows = parseCsvRows(csvContent);

  if (parsedRows.length === 0) {
    return {
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      validQuestions: [],
      errors: [{ row: 0, message: "CSV file is empty" }],
    };
  }

  // Parse header
  const header = parsedRows[0].map((h) => h.toLowerCase().trim());
  const colIndex = (name: string) => header.indexOf(name);

  const idxSeq = colIndex("sequence_number");
  const idxType = colIndex("question_type");
  const idxRef = colIndex("canonical_ref_code");
  const idxSubject = colIndex("primary_subject");
  const idxTopic = colIndex("default_topic");
  const idxQText = colIndex("question_text");
  const idxAssert = colIndex("assertion_text");
  const idxReason = colIndex("reason_text");
  const idxOptA = colIndex("option_a");
  const idxOptB = colIndex("option_b");
  const idxOptC = colIndex("option_c");
  const idxOptD = colIndex("option_d");
  const idxOptE = colIndex("option_e");
  const idxCorrect = colIndex("correct_answers");
  const idxExplain = colIndex("overall_explanation");
  const idxMarks = colIndex("marks_override");
  const idxNegMarks = colIndex("negative_marks_override");
  const idxPassageRef = colIndex("passage_ref_code");
  const idxPassageTitle = colIndex("passage_title");
  const idxPassageBody = colIndex("passage_body_text");
  const idxPassageLang = colIndex("passage_language");
  const idxPassageImg = colIndex("passage_image_url");
  const idxPassageAlt = colIndex("passage_image_alt");

  if (idxType === -1 || idxQText === -1 || idxOptA === -1 || idxOptB === -1 || idxCorrect === -1) {
    return {
      totalRows: parsedRows.length - 1,
      validCount: 0,
      errorCount: 1,
      validQuestions: [],
      errors: [
        {
          row: 1,
          message:
            "Missing mandatory headers: must include question_type, question_text, option_a, option_b, and correct_answers",
        },
      ],
    };
  }

  const validQuestions: QuestionAuthoringPayload[] = [];
  const errors: CsvImportRowError[] = [];
  const passageCache = new Map<
    string,
    {
      title?: string;
      bodyText: string;
      language?: string;
      imageUrl?: string;
      imageAlt?: string;
    }
  >();

  for (let r = 1; r < parsedRows.length; r++) {
    const row = parsedRows[r];
    const rowNum = r + 1; // 1-indexed for human readability

    // Skip completely blank rows
    if (row.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const rawType = (row[idxType] || "").toUpperCase().trim();
    let qType: SupportedQuestionType = "SINGLE_CORRECT";

    if (rawType === "SINGLE_CORRECT" || rawType === "SINGLE_CHOICE") {
      qType = "SINGLE_CORRECT";
    } else if (rawType === "MULTIPLE_CORRECT" || rawType === "MULTIPLE_CHOICE") {
      qType = "MULTIPLE_CORRECT";
    } else if (rawType === "ASSERTION_REASON") {
      qType = "ASSERTION_REASON";
    } else if (rawType === "COMPREHENSION_CHILD") {
      qType = "COMPREHENSION_CHILD";
    } else {
      errors.push({
        row: rowNum,
        message: `Unknown question_type "${rawType}". Must be SINGLE_CORRECT, MULTIPLE_CORRECT, ASSERTION_REASON, or COMPREHENSION_CHILD`,
      });
      continue;
    }

    const questionText = row[idxQText] || "";
    const assertionText = idxAssert !== -1 ? row[idxAssert] : undefined;
    const reasonText = idxReason !== -1 ? row[idxReason] : undefined;

    // Resolve passage fields
    const rawPassageRef = idxPassageRef !== -1 && row[idxPassageRef] ? row[idxPassageRef].trim() : "";
    const passageRefCode = rawPassageRef.length > 0 ? rawPassageRef : undefined;
    let passageTitle = idxPassageTitle !== -1 && row[idxPassageTitle] ? row[idxPassageTitle].trim() : undefined;
    let passageBodyText = idxPassageBody !== -1 && row[idxPassageBody] ? row[idxPassageBody].trim() : undefined;
    let passageLanguage = idxPassageLang !== -1 && row[idxPassageLang] ? row[idxPassageLang].trim().toUpperCase() : undefined;
    let passageImageUrl = idxPassageImg !== -1 && row[idxPassageImg] ? row[idxPassageImg].trim() : undefined;
    let passageImageAlt = idxPassageAlt !== -1 && row[idxPassageAlt] ? row[idxPassageAlt].trim() : undefined;

    if (passageRefCode) {
      if (passageBodyText && passageBodyText.length > 0) {
        passageCache.set(passageRefCode, {
          title: passageTitle,
          bodyText: passageBodyText,
          language: passageLanguage,
          imageUrl: passageImageUrl,
          imageAlt: passageImageAlt,
        });
      } else {
        const cached = passageCache.get(passageRefCode);
        if (cached) {
          passageTitle = passageTitle || cached.title;
          passageBodyText = cached.bodyText;
          passageLanguage = passageLanguage || cached.language;
          passageImageUrl = passageImageUrl || cached.imageUrl;
          passageImageAlt = passageImageAlt || cached.imageAlt;
        }
      }
    }

    // Parse options A, B, C, D, E
    const optLabels = ["A", "B", "C", "D", "E"];
    const optValues = [
      row[idxOptA] || "",
      row[idxOptB] || "",
      idxOptC !== -1 ? row[idxOptC] || "" : "",
      idxOptD !== -1 ? row[idxOptD] || "" : "",
      idxOptE !== -1 ? row[idxOptE] || "" : "",
    ];

    // Parse correct answers (e.g. "A" or "B, D" or "B;D")
    const rawCorrect = (row[idxCorrect] || "")
      .toUpperCase()
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const correctSet = new Set(rawCorrect);

    const options = [];
    for (let o = 0; o < optLabels.length; o++) {
      const text = optValues[o];
      if (text.length > 0) {
        const label = optLabels[o];
        options.push({
          optionLabel: label,
          optionText: text,
          isCorrect: correctSet.has(label),
          sortOrder: o + 1,
        });
      }
    }

    const marksStr = idxMarks !== -1 ? row[idxMarks] : "";
    const negMarksStr = idxNegMarks !== -1 ? row[idxNegMarks] : "";

    const payload: QuestionAuthoringPayload = {
      paperId: targetPaperId,
      sequenceNumber: idxSeq !== -1 && row[idxSeq] ? parseInt(row[idxSeq], 10) : undefined,
      canonicalRefCode: idxRef !== -1 ? row[idxRef] : undefined,
      primarySubject: idxSubject !== -1 && row[idxSubject] ? row[idxSubject] : "General",
      defaultTopic: idxTopic !== -1 && row[idxTopic] ? row[idxTopic] : "General",
      questionType: qType,
      passageRefCode: passageRefCode || undefined,
      passageTitle: passageTitle || undefined,
      passageBodyText: passageBodyText || undefined,
      passageLanguage: passageLanguage || undefined,
      passageImageUrl: passageImageUrl || undefined,
      passageImageAlt: passageImageAlt || undefined,
      questionText,
      assertionText: assertionText || undefined,
      reasonText: reasonText || undefined,
      options,
      overallExplanation: idxExplain !== -1 ? row[idxExplain] : undefined,
      marksOverride: marksStr ? parseFloat(marksStr) : undefined,
      negativeMarksOverride: negMarksStr ? parseFloat(negMarksStr) : undefined,
    };

    // Validate using server-authoritative schema
    const validation = validateQuestionConfiguration(payload);
    if (!validation.valid) {
      errors.push({
        row: rowNum,
        message: validation.errors.join("; "),
      });
    } else {
      validQuestions.push(validation.data as QuestionAuthoringPayload);
    }
  }

  return {
    totalRows: parsedRows.length - 1,
    validCount: validQuestions.length,
    errorCount: errors.length,
    validQuestions,
    errors,
  };
}
