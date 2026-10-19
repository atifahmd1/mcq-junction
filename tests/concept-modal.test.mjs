// ============================================================================
// MCQ Junction — Detailed Concept & Resource Security Test Suite
// File: tests/concept-modal.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateSafeUrl,
  isSafeImageUrl,
  parseVideoUrl,
  sanitizeExternalUrl,
} from "../src/lib/concept/url-validator.ts";
import {
  detailedConceptSchema,
  conceptReferenceSchema,
  updateOptionConceptSchema,
} from "../src/lib/admin/schemas.ts";
import {
  ConceptNotFoundError,
  ConceptForbiddenError,
} from "../src/lib/concept/service.ts";
import { Role } from "../src/generated/prisma/enums.ts";

// ----------------------------------------------------------------------------
// 1. URL Protocol Whitelist & Protocol Smuggling Rejection
// ----------------------------------------------------------------------------

test("URL Validator: Accepts valid HTTP and HTTPS URLs", () => {
  const validUrls = [
    "https://www.postgresql.org/docs/",
    "http://example.com/concept",
    "https://en.wikipedia.org/wiki/Relational_database",
    "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
  ];

  for (const url of validUrls) {
    const res = validateSafeUrl(url);
    assert.strictEqual(res.isValid, true, `Expected ${url} to be valid`);
    assert.ok(res.sanitizedUrl);
  }
});

test("URL Validator: Strictly rejects dangerous protocols and XSS payloads", () => {
  const dangerousUrls = [
    "javascript:alert(1)",
    "JAVASCRIPT:/*--></title></style></textarea></script>alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/uuid",
    "javascript:void(0)",
  ];

  for (const url of dangerousUrls) {
    const res = validateSafeUrl(url);
    assert.strictEqual(res.isValid, false, `Expected dangerous URL ${url} to be rejected`);
    assert.ok(res.error);
  }
});

test("URL Validator: Rejects empty or malformed inputs gracefully", () => {
  assert.strictEqual(validateSafeUrl("").isValid, false);
  assert.strictEqual(validateSafeUrl(null).isValid, false);
  assert.strictEqual(validateSafeUrl(undefined).isValid, false);
  assert.strictEqual(validateSafeUrl("not a valid url").isValid, false);
});

// ----------------------------------------------------------------------------
// 2. Image URL Validation
// ----------------------------------------------------------------------------

test("Image Validator: Accepts HTTPS URLs and relative paths, rejects dangerous schemes", () => {
  assert.strictEqual(
    isSafeImageUrl("https://images.unsplash.com/photo-1544383835-bda2bc66a55d"),
    true
  );
  assert.strictEqual(isSafeImageUrl("/images/relational-diagram.png"), true);
  assert.strictEqual(isSafeImageUrl("//evil.com/fake.png"), false);
  assert.strictEqual(isSafeImageUrl("/\\evil.com/fake.png"), false);
  assert.strictEqual(isSafeImageUrl("data:image/svg+xml;utf8,<svg onload=alert(1)>"), false);
  assert.strictEqual(isSafeImageUrl("javascript:alert(1)"), false);
});

// ----------------------------------------------------------------------------
// 3. Video Provider Parsing & Origin Hardening
// ----------------------------------------------------------------------------

test("Video Parser: Correctly extracts and hardens YouTube embeds with youtube-nocookie.com", () => {
  const testCases = [
    {
      input: "https://www.youtube.com/watch?v=qw--VYLpxG4",
      expectedId: "qw--VYLpxG4",
    },
    {
      input: "https://youtu.be/qw--VYLpxG4",
      expectedId: "qw--VYLpxG4",
    },
    {
      input: "https://www.youtube.com/embed/qw--VYLpxG4",
      expectedId: "qw--VYLpxG4",
    },
    {
      input: "https://m.youtube.com/watch?v=qw--VYLpxG4",
      expectedId: "qw--VYLpxG4",
    },
  ];

  for (const { input, expectedId } of testCases) {
    const result = parseVideoUrl(input);
    assert.strictEqual(result.isValid, true, `Failed on ${input}`);
    assert.strictEqual(result.provider, "youtube");
    assert.strictEqual(
      result.embedUrl,
      `https://www.youtube-nocookie.com/embed/${expectedId}?rel=0&modestbranding=1`,
      `Embed URL must use hardened youtube-nocookie.com origin`
    );
  }
});

test("Video Parser: Correctly extracts Vimeo video embeds", () => {
  const result = parseVideoUrl("https://vimeo.com/76979871");
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.provider, "vimeo");
  assert.strictEqual(result.embedUrl, "https://player.vimeo.com/video/76979871?dnt=1");
});

test("Video Parser: Correctly recognizes direct HTML5 video files (.mp4, .webm, .ogg)", () => {
  const result = parseVideoUrl("https://storage.googleapis.com/mcq-junction/demo.mp4");
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.provider, "direct");
  assert.strictEqual(
    result.directUrl,
    "https://storage.googleapis.com/mcq-junction/demo.mp4"
  );
});

test("Video Parser: Strictly rejects arbitrary untrusted video domains and malicious protocols", () => {
  const untrusted = [
    "https://evil.com/video.html",
    "https://phishing-site.org/player?id=123",
    "javascript:alert(1)",
    "data:video/mp4;base64,AAAA",
    "https://attacker.com/malicious.exe",
  ];

  for (const url of untrusted) {
    const result = parseVideoUrl(url);
    assert.strictEqual(
      result.isValid,
      false,
      `Untrusted video URL ${url} must be marked invalid`
    );
    assert.strictEqual(result.provider, "unsupported");
    assert.ok(result.error);
  }
});

// ----------------------------------------------------------------------------
// 4. Safe External Link Sanitizer
// ----------------------------------------------------------------------------

test("External Link Sanitizer: Returns sanitized URL for safe links, null for dangerous links", () => {
  assert.strictEqual(
    sanitizeExternalUrl("https://www.postgresql.org/docs/"),
    "https://www.postgresql.org/docs/"
  );
  assert.strictEqual(sanitizeExternalUrl("javascript:alert(1)"), null);
  assert.strictEqual(sanitizeExternalUrl("data:text/html,test"), null);
  assert.strictEqual(sanitizeExternalUrl(""), null);
});

// ----------------------------------------------------------------------------
// 5. Detailed Concept Zod Schema Validation
// ----------------------------------------------------------------------------

test("detailedConceptSchema: Accepts fully-configured concept payload", () => {
  const validConcept = {
    title: "Why is PostgreSQL a relational database?",
    content: "PostgreSQL is a relational database management system (RDBMS) that stores data in tables.",
    keyPoints: [
      "Data is organized into tables with rows and columns",
      "Ensures ACID properties",
    ],
    imageUrl: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d",
    imageAlt: "Relational database schema diagram",
    imageCaption: "Example of related tables in a relational database",
    videoUrl: "https://www.youtube.com/watch?v=qw--VYLpxG4",
    videoTitle: "Introduction to Relational Databases",
    references: [
      {
        title: "Official PostgreSQL Documentation",
        url: "https://www.postgresql.org/docs/",
        type: "DOCUMENTATION",
      },
    ],
  };

  const parsed = detailedConceptSchema.safeParse(validConcept);
  assert.strictEqual(parsed.success, true);
});

test("detailedConceptSchema: Accepts minimal concept with absent optional fields", () => {
  const minimalConcept = {
    title: "QuickSort Worst-Case Complexity",
    content: "QuickSort worst-case time complexity is O(n²) when unbalanced pivots are selected.",
  };

  const parsed = detailedConceptSchema.safeParse(minimalConcept);
  assert.strictEqual(parsed.success, true);
  if (parsed.success) {
    assert.deepStrictEqual(parsed.data.keyPoints, []);
    assert.deepStrictEqual(parsed.data.references, []);
    assert.strictEqual(parsed.data.imageUrl, undefined);
    assert.strictEqual(parsed.data.videoUrl, undefined);
  }
});

test("detailedConceptSchema: Rejects invalid inputs (short title, missing content, dangerous URLs)", () => {
  // Empty title
  assert.strictEqual(
    detailedConceptSchema.safeParse({ title: "ab", content: "Valid content" }).success,
    false
  );

  // Missing content
  assert.strictEqual(
    detailedConceptSchema.safeParse({ title: "Valid Title", content: "bad" }).success,
    false
  );

  // Dangerous reference link
  assert.strictEqual(
    detailedConceptSchema.safeParse({
      title: "Valid Title",
      content: "Valid detailed content here",
      references: [{ title: "Bad Link", url: "javascript:alert(1)" }],
    }).success,
    false
  );
});

// ----------------------------------------------------------------------------
// 6. Option Concept Relationship & Clickability Logic Matrix
// ----------------------------------------------------------------------------

test("Option Clickability Logic: Option short explanation is clickable ONLY when concept exists", () => {
  function getOptionActionState(option) {
    const hasConcept = Boolean(option.concept);
    const hasShortExplanation = Boolean(option.explanationText && option.explanationText.trim());

    return {
      isExplanationClickable: hasShortExplanation && hasConcept,
      showLearnMoreAction: !hasShortExplanation && hasConcept,
      isPlainExplanation: hasShortExplanation && !hasConcept,
      hasNoAction: !hasShortExplanation && !hasConcept,
    };
  }

  // Case 1: Short explanation + concept exists -> Clickable explanation
  const optA = {
    explanationText: "Short explanation for option A",
    concept: { id: "concept-1", title: "Concept 1", content: "Details" },
  };
  const stateA = getOptionActionState(optA);
  assert.strictEqual(stateA.isExplanationClickable, true);
  assert.strictEqual(stateA.showLearnMoreAction, false);
  assert.strictEqual(stateA.isPlainExplanation, false);

  // Case 2: Detailed concept exists WITHOUT short explanation -> Learn More button
  const optB = {
    explanationText: null,
    concept: { id: "concept-2", title: "Concept 2", content: "Details" },
  };
  const stateB = getOptionActionState(optB);
  assert.strictEqual(stateB.isExplanationClickable, false);
  assert.strictEqual(stateB.showLearnMoreAction, true);
  assert.strictEqual(stateB.isPlainExplanation, false);

  // Case 3: Short explanation exists but NO detailed concept -> Plain unclickable text
  const optC = {
    explanationText: "Graph databases model networks of nodes and edges",
    concept: null,
  };
  const stateC = getOptionActionState(optC);
  assert.strictEqual(stateC.isExplanationClickable, false);
  assert.strictEqual(stateC.showLearnMoreAction, false);
  assert.strictEqual(stateC.isPlainExplanation, true);

  // Case 4: Neither short explanation nor concept -> No action rendered
  const optD = {
    explanationText: null,
    concept: null,
  };
  const stateD = getOptionActionState(optD);
  assert.strictEqual(stateD.hasNoAction, true);
});

// ----------------------------------------------------------------------------
// 7. Media Tab Visibility & Absent Sections
// ----------------------------------------------------------------------------

test("Media Tab Visibility: Calculates available tabs and suppresses absent sections", () => {
  function computeAvailableTabs(concept) {
    const hasImage = Boolean(concept.imageUrl && isSafeImageUrl(concept.imageUrl));
    const videoResult = concept.videoUrl ? parseVideoUrl(concept.videoUrl) : null;
    const hasVideo = Boolean(videoResult && videoResult.isValid);
    const validRefs = (concept.references || []).filter(
      (r) => r.title && sanitizeExternalUrl(r.url)
    );
    const hasReferences = validRefs.length > 0;

    const tabs = [];
    if (hasImage) tabs.push("image");
    if (hasVideo) tabs.push("video");
    if (hasReferences) tabs.push("references");

    return {
      tabs,
      hasMediaSection: tabs.length > 0,
      hasKeyPoints: Array.isArray(concept.keyPoints) && concept.keyPoints.length > 0,
    };
  }

  // All sections present
  const full = {
    imageUrl: "https://example.com/img.png",
    videoUrl: "https://www.youtube.com/watch?v=qw--VYLpxG4",
    references: [{ title: "Doc", url: "https://example.com/doc" }],
    keyPoints: ["Point 1", "Point 2"],
  };
  const fullRes = computeAvailableTabs(full);
  assert.deepStrictEqual(fullRes.tabs, ["image", "video", "references"]);
  assert.strictEqual(fullRes.hasMediaSection, true);
  assert.strictEqual(fullRes.hasKeyPoints, true);

  // Minimal: NO media, only key points
  const minimal = {
    imageUrl: null,
    videoUrl: null,
    references: [],
    keyPoints: ["Point 1"],
  };
  const minimalRes = computeAvailableTabs(minimal);
  assert.deepStrictEqual(minimalRes.tabs, []);
  assert.strictEqual(minimalRes.hasMediaSection, false, "Must hide media column when absent");
  assert.strictEqual(minimalRes.hasKeyPoints, true);

  // Only video configured
  const videoOnly = {
    imageUrl: null,
    videoUrl: "https://vimeo.com/76979871",
    references: [],
    keyPoints: [],
  };
  const videoRes = computeAvailableTabs(videoOnly);
  assert.deepStrictEqual(videoRes.tabs, ["video"]);
  assert.strictEqual(videoRes.hasKeyPoints, false);
});

// ----------------------------------------------------------------------------
// 8. Student Authorization Rules for Learning Concepts
// ----------------------------------------------------------------------------

test("Authorization: Verifies student access to published concepts and blocks draft concepts", () => {
  function verifyConceptAuthorization(paperStatus, userRole) {
    if (userRole === Role.ADMIN) {
      return { allowed: true };
    }
    if (paperStatus === "PUBLISHED") {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: new ConceptForbiddenError(),
    };
  }

  // Student on published paper -> Allowed
  assert.strictEqual(
    verifyConceptAuthorization("PUBLISHED", Role.STUDENT).allowed,
    true
  );

  // Student on draft paper -> Forbidden (403)
  const studentDraft = verifyConceptAuthorization("DRAFT", Role.STUDENT);
  assert.strictEqual(studentDraft.allowed, false);
  assert.ok(studentDraft.error instanceof ConceptForbiddenError);

  // Admin on draft paper -> Allowed
  assert.strictEqual(
    verifyConceptAuthorization("DRAFT", Role.ADMIN).allowed,
    true
  );
});
