// ============================================================================
// MCQ Junction — CSV / XLSX Import & Export Pipeline Test Suite (Phase 8.1)
// File: tests/import-export.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeQuestionsToCsv,
  parseQuestionsFromCsv,
  parseCsvRows,
  CSV_HEADERS,
} from "../src/lib/questions/import-export.ts";

const testPaperId = "11111111-2222-4333-8444-555555555555";

// Helper to construct a standard CSV row matching CSV_HEADERS
function makeCsvRow(data) {
  const rowObj = {
    sequence_number: "",
    question_type: "SINGLE_CORRECT",
    canonical_ref_code: "",
    primary_subject: "General",
    default_topic: "General",
    passage_ref_code: "",
    passage_title: "",
    passage_body_text: "",
    passage_language: "",
    passage_image_url: "",
    passage_image_alt: "",
    question_text: "Sample question prompt?",
    assertion_text: "",
    reason_text: "",
    option_a: "Option A",
    option_b: "Option B",
    option_c: "Option C",
    option_d: "Option D",
    option_e: "",
    correct_answers: "A",
    overall_explanation: "",
    marks_override: "",
    negative_marks_override: "",
    ...data,
  };

  return CSV_HEADERS.map((h) => {
    const val = rowObj[h] ?? "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(",");
}

// ----------------------------------------------------------------------------
// 1. Serialization Tests (RFC 4180 & Excel UTF-8 BOM)
// ----------------------------------------------------------------------------

test("IMP-01: serializeQuestionsToCsv produces valid RFC 4180 CSV with UTF-8 BOM", () => {
  const rows = [
    {
      sequenceNumber: 1,
      questionType: "SINGLE_CORRECT",
      canonicalRefCode: "CQ-TEST-1",
      primarySubject: "DBMS",
      defaultTopic: "Indexing",
      passageRefCode: null,
      passageTitle: null,
      passageBodyText: null,
      passageLanguage: null,
      passageImageUrl: null,
      passageImageAlt: null,
      questionText: "Which index type uses balanced trees?",
      assertionText: null,
      reasonText: null,
      optionA: "B-Tree",
      optionB: "Linear List",
      optionC: "Hash Bucket",
      optionD: "Bitmap",
      optionE: null,
      correctAnswers: "A",
      overallExplanation: "B-Trees maintain balanced height.",
      marksOverride: 2.0,
      negativeMarksOverride: 0.5,
    },
    {
      sequenceNumber: 2,
      questionType: "MULTIPLE_CORRECT",
      canonicalRefCode: "CQ-TEST-2",
      primarySubject: "Algorithms",
      defaultTopic: "Sorting",
      passageRefCode: null,
      passageTitle: null,
      passageBodyText: null,
      passageLanguage: null,
      passageImageUrl: null,
      passageImageAlt: null,
      questionText: "Which algorithms have O(n log n) average time complexity?",
      assertionText: null,
      reasonText: null,
      optionA: "MergeSort",
      optionB: "BubbleSort",
      optionC: "QuickSort",
      optionD: "HeapSort",
      optionE: null,
      correctAnswers: "A,C,D",
      overallExplanation: "MergeSort, QuickSort, and HeapSort achieve O(n log n).",
      marksOverride: 3.0,
      negativeMarksOverride: 1.0,
    },
  ];

  const csv = serializeQuestionsToCsv(rows);

  // Must begin with \uFEFF for Excel UTF-8 auto-detection
  assert.strictEqual(csv.startsWith("\uFEFF"), true);

  // Check header line
  assert.strictEqual(csv.includes(CSV_HEADERS.join(",")), true);

  // Check quoted multiple correct answers
  assert.strictEqual(csv.includes('"A,C,D"'), true);
});

test("IMP-02: parseCsvRows handles multiline quotes and commas within cells", () => {
  const sample = `col1,col2,col3\r\n"Multi\r\nLine","With, Comma","Normal"`;
  const rows = parseCsvRows(sample);

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][0], "Multi\r\nLine");
  assert.strictEqual(rows[1][1], "With, Comma");
  assert.strictEqual(rows[1][2], "Normal");
});

// ----------------------------------------------------------------------------
// 2. CSV Import Parsing & Validation Tests
// ----------------------------------------------------------------------------

test("IMP-03: parseQuestionsFromCsv parses and validates valid Single, Multiple, and Assertion-Reason rows", () => {
  const row1 = makeCsvRow({
    sequence_number: 1,
    question_type: "SINGLE_CORRECT",
    canonical_ref_code: "CQ-1",
    primary_subject: "DBMS",
    default_topic: "Architecture",
    question_text: "What is PostgreSQL?",
    option_a: "RDBMS",
    option_b: "NoSQL",
    option_c: "Graph",
    option_d: "Key-Value",
    correct_answers: "A",
    overall_explanation: "PostgreSQL is an RDBMS",
  });

  const row2 = makeCsvRow({
    sequence_number: 2,
    question_type: "MULTIPLE_CORRECT",
    canonical_ref_code: "CQ-2",
    primary_subject: "Algorithms",
    default_topic: "Bounds",
    question_text: "Which are O(log n)?",
    option_a: "Unsorted",
    option_b: "Red-Black",
    option_c: "Hash",
    option_d: "B-Tree",
    correct_answers: "B,D",
    overall_explanation: "Balanced trees",
  });

  const row3 = makeCsvRow({
    sequence_number: 3,
    question_type: "ASSERTION_REASON",
    canonical_ref_code: "CQ-3",
    primary_subject: "DBMS",
    default_topic: "Keys",
    question_text: "Evaluate the integrity statements:",
    assertion_text: "Foreign keys eliminate orphans.",
    reason_text: "PostgreSQL enforces referential checks at statement boundaries.",
    option_a: "Both A and R are true and R explains A",
    option_b: "Both A and R are true but R does not explain A",
    option_c: "A is true but R is false",
    option_d: "A is false but R is true",
    correct_answers: "A",
    overall_explanation: "FK rationale",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${row1}\r\n${row2}\r\n${row3}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.errorCount, 0, `Expected 0 errors, got: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.validCount, 3);
  assert.strictEqual(result.validQuestions[0].questionType, "SINGLE_CORRECT");
  assert.strictEqual(result.validQuestions[1].questionType, "MULTIPLE_CORRECT");
  assert.strictEqual(result.validQuestions[2].questionType, "ASSERTION_REASON");
});

test("IMP-04: parseQuestionsFromCsv supports backward-compatible legacy aliases SINGLE_CHOICE and MULTIPLE_CHOICE", () => {
  const row1 = makeCsvRow({
    sequence_number: 1,
    question_type: "SINGLE_CHOICE",
    canonical_ref_code: "CQ-L1",
    question_text: "Legacy Single Choice Question",
    correct_answers: "A",
  });

  const row2 = makeCsvRow({
    sequence_number: 2,
    question_type: "MULTIPLE_CHOICE",
    canonical_ref_code: "CQ-L2",
    question_text: "Legacy Multiple Choice Question",
    correct_answers: "A,B",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${row1}\r\n${row2}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.errorCount, 0, `Expected 0 errors, got: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.validCount, 2);
  assert.strictEqual(result.validQuestions[0].questionType, "SINGLE_CORRECT");
  assert.strictEqual(result.validQuestions[1].questionType, "MULTIPLE_CORRECT");
});

test("IMP-05: parseQuestionsFromCsv reports row-by-row errors for invalid rows without aborting valid ones", () => {
  const row1 = makeCsvRow({
    sequence_number: 1,
    question_type: "SINGLE_CORRECT",
    canonical_ref_code: "CQ-1",
    question_text: "Valid Question 1",
    correct_answers: "A",
  });

  const row2 = makeCsvRow({
    sequence_number: 2,
    question_type: "SINGLE_CORRECT",
    canonical_ref_code: "CQ-2",
    question_text: "Invalid: 2 correct in single choice",
    correct_answers: "A,B", // Invalid for SINGLE_CORRECT
  });

  const row3 = makeCsvRow({
    sequence_number: 3,
    question_type: "UNKNOWN_TYPE",
    canonical_ref_code: "CQ-3",
    question_text: "Invalid question type",
    correct_answers: "A",
  });

  const row4 = makeCsvRow({
    sequence_number: 4,
    question_type: "MULTIPLE_CORRECT",
    canonical_ref_code: "CQ-4",
    question_text: "Valid Question 4",
    correct_answers: "B,C",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${row1}\r\n${row2}\r\n${row3}\r\n${row4}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.validCount, 2);
  assert.strictEqual(result.errorCount, 2);
  assert.strictEqual(result.errors[0].row, 3); // row 2 data
  assert.strictEqual(result.errors[1].row, 4); // row 3 data
  assert.strictEqual(result.validQuestions[0].sequenceNumber, 1);
  assert.strictEqual(result.validQuestions[1].sequenceNumber, 4);
});

// ----------------------------------------------------------------------------
// 3. Comprehension Passage & Multi-Language Tests (Phase 8.1)
// ----------------------------------------------------------------------------

test("IMP-06: parseQuestionsFromCsv imports comprehension passage and reuses cached passage text across child questions", () => {
  const sharedPassageText = "A distributed key-value store provides atomic operations across replica partitions. Under network partition, the system guarantees linearizability at the cost of availability.";

  const row1 = makeCsvRow({
    sequence_number: 1,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-CAP-1",
    passage_ref_code: "PASS-CAP-01",
    passage_title: "CAP Theorem Analysis",
    passage_body_text: sharedPassageText,
    passage_language: "EN",
    question_text: "Which guarantee is maintained during partition?",
    option_a: "Consistency (Linearizability)",
    option_b: "Availability",
    option_c: "Latency minimization",
    option_d: "Network idempotency",
    correct_answers: "A",
  });

  // Second question refers to PASS-CAP-01 without repeating passage_body_text
  const row2 = makeCsvRow({
    sequence_number: 2,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-CAP-2",
    passage_ref_code: "PASS-CAP-01",
    passage_title: "",
    passage_body_text: "", // inherited from cache
    passage_language: "",
    question_text: "What trade-off does the system explicitly make?",
    option_a: "Partitions are rejected",
    option_b: "Availability is sacrificed for linearizability",
    option_c: "No trade-off is required",
    option_d: "Eventual consistency only",
    correct_answers: "B",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${row1}\r\n${row2}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.errorCount, 0, `Expected 0 errors, got: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.validCount, 2);

  // Both questions have passageRefCode linked
  assert.strictEqual(result.validQuestions[0].passageRefCode, "PASS-CAP-01");
  assert.strictEqual(result.validQuestions[0].passageBodyText, sharedPassageText);
  assert.strictEqual(result.validQuestions[1].passageRefCode, "PASS-CAP-01");
  // Cached body text was successfully applied to question 2
  assert.strictEqual(result.validQuestions[1].passageBodyText, sharedPassageText);
});

test("IMP-07: parseQuestionsFromCsv preserves multi-language Unicode scripts (Hindi, Urdu, Bangla)", () => {
  // Hindi passage
  const rowHI = makeCsvRow({
    sequence_number: 1,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-HI-01",
    passage_ref_code: "PASS-HI-01",
    passage_title: "डेटाबेस प्रबंधन और ACID सिद्धांत",
    passage_body_text: "रिलेशनल डेटाबेस में लेन-देन की अखंडता बनाए रखने के लिए ACID गुण आवश्यक हैं।",
    passage_language: "HI",
    question_text: "ACID में 'A' का क्या अर्थ है?",
    option_a: "एटोमिसिटी (Atomicity)",
    option_b: "एसिंक्रोनस (Asynchronous)",
    option_c: "अकाउंटेबिलिटी (Accountability)",
    option_d: "ऑथेंटिकेशन (Authentication)",
    correct_answers: "A",
  });

  // Urdu passage (RTL)
  const rowUR = makeCsvRow({
    sequence_number: 2,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-UR-01",
    passage_ref_code: "PASS-UR-01",
    passage_title: "ڈیٹا بیس ٹرانزیکشن",
    passage_body_text: "ڈیٹا بیس میں ٹرانزیکشن ایک منطقی کام کی اکائی ہے جو ڈیٹا کی سالمیت کو یقینی بناتی ہے۔",
    passage_language: "UR",
    question_text: "ٹرانزیکشن کا بنیادی مقصد کیا ہے؟",
    option_a: "ڈیٹا کی درستگی اور مستقل مزاجی",
    option_b: "نیٹ ورک کی رفتار بڑھانا",
    option_c: "ہارڈ ڈرائیو کو فارمیٹ کرنا",
    option_d: "کوئی نہیں",
    correct_answers: "A",
  });

  // Bangla passage
  const rowBN = makeCsvRow({
    sequence_number: 3,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-BN-01",
    passage_ref_code: "PASS-BN-01",
    passage_title: "অপারেটিং সিস্টেম এবং থ্রেড",
    passage_body_text: "একটি প্রসেসের মধ্যে একাধিক থ্রেড একই মেমরি স্পেস শেয়ার করে কাজ সম্পাদন করে।",
    passage_language: "BN",
    question_text: "থ্রেডগুলি কী শেয়ার করে?",
    option_a: "মেমরি স্পেস",
    option_b: "আলাদা প্রসেসর রেজিস্টার",
    option_c: "আলাদা স্ট্যাক",
    option_d: "কোনোটিই নয়",
    correct_answers: "A",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${rowHI}\r\n${rowUR}\r\n${rowBN}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.errorCount, 0, `Expected 0 errors, got: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.validCount, 3);

  // Check Unicode script preservation
  assert.strictEqual(result.validQuestions[0].passageLanguage, "HI");
  assert.strictEqual(result.validQuestions[0].passageTitle, "डेटाबेस प्रबंधन और ACID सिद्धांत");
  assert.strictEqual(result.validQuestions[1].passageLanguage, "UR");
  assert.strictEqual(result.validQuestions[1].passageTitle, "ڈیٹا بیس ٹرانزیکشن");
  assert.strictEqual(result.validQuestions[2].passageLanguage, "BN");
  assert.strictEqual(result.validQuestions[2].passageTitle, "অপারেটিং সিস্টেম এবং থ্রেড");
});

test("IMP-08: parseQuestionsFromCsv rejects COMPREHENSION_CHILD missing passage association", () => {
  const row = makeCsvRow({
    sequence_number: 1,
    question_type: "COMPREHENSION_CHILD",
    canonical_ref_code: "CQ-INVALID-01",
    passage_ref_code: "", // Missing mandatory passage reference
    passage_body_text: "",
    question_text: "Orphaned comprehension question?",
    correct_answers: "A",
  });

  const csvContent = `${CSV_HEADERS.join(",")}\r\n${row}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.validCount, 0);
  assert.strictEqual(result.errorCount, 1);
  assert.strictEqual(result.errors[0].row, 2);
  assert.strictEqual(result.errors[0].message.includes("requires a linked passage"), true);
});

test("IMP-09: parseQuestionsFromCsv parses legacy CSV headers without passage columns (backward compatibility)", () => {
  const legacyHeaders = [
    "sequence_number",
    "question_type",
    "canonical_ref_code",
    "primary_subject",
    "default_topic",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answers",
    "overall_explanation",
  ];

  const legacyRow = [
    "1",
    "SINGLE_CORRECT",
    "LEGACY-01",
    "Networks",
    "Routing",
    "Which protocol operates at the network layer?",
    "IP",
    "TCP",
    "HTTP",
    "Ethernet",
    "A",
    "IP is the Layer 3 protocol.",
  ].join(",");

  const csvContent = `${legacyHeaders.join(",")}\r\n${legacyRow}`;
  const result = parseQuestionsFromCsv(csvContent, testPaperId);

  assert.strictEqual(result.errorCount, 0, `Expected 0 errors, got: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.validCount, 1);
  assert.strictEqual(result.validQuestions[0].questionType, "SINGLE_CORRECT");
  assert.strictEqual(result.validQuestions[0].primarySubject, "Networks");
  assert.strictEqual(result.validQuestions[0].passageRefCode, undefined);
});
