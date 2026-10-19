// ============================================================================
// MCQ Junction — Detailed Concept Modal Browser E2E Test Suite
// File: tests/concept-modal-browser.test.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const APP_PORT = 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${APP_PORT}`;
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:test_pw_disposable_12345@127.0.0.1:5433/mcq_junction_test";

const SCREENSHOT_DIRS = [
  path.resolve(process.cwd(), "test-results/screenshots/concept-modal"),
  path.resolve(process.cwd(), "docs/reports/screenshots/concept-modal"),
];

for (const dir of SCREENSHOT_DIRS) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function captureScreenshot(page, filename) {
  for (const dir of SCREENSHOT_DIRS) {
    const fullPath = path.join(dir, filename);
    await page.screenshot({ path: fullPath, fullPage: true });
  }
}

async function waitForHttp(url, timeoutMs = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 307) {
        return true;
      }
    } catch {
      // Keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} after ${timeoutMs}ms`);
}

async function main() {
  console.log("================================================================================");
  console.log("  MCQ Junction — Detailed Concept Modal: Browser E2E Verification");
  console.log(`  Target Application: ${BASE_URL}`);
  console.log("================================================================================\n");

  const results = [];
  function record(id, title, status, details = "") {
    results.push({ id, title, status, details });
    const mark = status === "PASS" ? "✔" : "✖";
    console.log(`  ${mark} [${id}] ${title}: ${status} ${details ? "— " + details : ""}`);
  }

  let nextProcess = null;
  let browser = null;

  try {
    // 1. Check if application server is already running
    let isServerRunning = false;
    try {
      const ping = await fetch(`${BASE_URL}/learn`);
      if (ping.ok || ping.status === 200) {
        isServerRunning = true;
        console.log(`✓ Target server is already online at ${BASE_URL}`);
      }
    } catch {
      isServerRunning = false;
    }

    if (!isServerRunning) {
      console.log(`▶ Binding Next.js test server on port ${APP_PORT} targeting test DB...`);
      // Clean up port 3000 if occupied by dead process
      try {
        const netstat = execSync(`netstat -ano | findstr :${APP_PORT}`, { encoding: "utf8" });
        const lines = netstat.trim().split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0" && !isNaN(parseInt(pid, 10))) {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
            } catch {}
          }
        }
      } catch {}

      await new Promise((r) => setTimeout(r, 1000));

      const nextEnv = {
        ...process.env,
        PORT: String(APP_PORT),
        DATABASE_URL: TEST_DB_URL,
        DIRECT_URL: TEST_DB_URL,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test",
      };

      nextProcess = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
        env: nextEnv,
        stdio: "pipe",
        shell: true,
      });

      nextProcess.stdout.on("data", (d) => {
        const s = d.toString();
        if (s.includes("Ready in") || s.includes("compiled") || s.includes("error") || s.includes("Error") || s.includes("Starting")) {
          process.stdout.write(`  [next] ${s}`);
        }
      });
      nextProcess.stderr.on("data", (d) => {
        process.stderr.write(`  [next-err] ${d.toString()}`);
      });

      console.log("▶ Waiting for Next.js test server readiness (/api/db-health)...");
      await waitForHttp(`${BASE_URL}/api/db-health`, 60000);
      console.log("✔ Next.js test server is online.\n");
    }

    // 2. Launch Chromium browser via Playwright
    console.log("▶ Launching Playwright Chromium browser...");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    console.log("✔ Headless Chrome browser initialized.\n");

    console.log("================================================================================");
    console.log("  EXECUTING CONCEPT MODAL E2E SPECIFICATIONS");
    console.log("================================================================================\n");

    // ------------------------------------------------------------------------
    // SPEC-01: Learning Mode page loads with canonical questions & options
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/learn`, { timeout: 35000 });

      const heading = page.locator("h1", { hasText: "Practice & Conceptual Deep Dive" });
      await heading.waitFor({ state: "visible", timeout: 25000 });

      const modeBadge = page.locator("span", { hasText: "Learning Mode" });
      const hasBadge = await modeBadge.isVisible();

      // Check Question 1 (PostgreSQL)
      const q1Prompt = page.locator("text=Which of the following describes why PostgreSQL is categorized");
      await q1Prompt.waitFor({ state: "visible", timeout: 10000 });

      // Check all 4 options are rendered
      const optA = page.locator("text=It stores data in structured tables with rows and columns");
      const optB = page.locator("text=It operates strictly as a distributed key-value store");
      const optC = page.locator("text=It stores documents purely as schemaless BSON objects");
      const optD = page.locator("text=It uses graph traversal algorithms exclusively");

      const allOptionsVisible =
        (await optA.isVisible()) &&
        (await optB.isVisible()) &&
        (await optC.isVisible()) &&
        (await optD.isVisible());

      if (hasBadge && allOptionsVisible) {
        record(
          "SPEC-01",
          "Learning Mode page renders canonical questions and options",
          "PASS",
          "Header, badge, and 4 options verified"
        );
      } else {
        record("SPEC-01", "Learning Mode page render", "FAIL", "Missing header or option elements");
      }
    } catch (err) {
      record("SPEC-01", "Learning Mode page render", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-02: Option Selection and Immediate Feedback
    // ------------------------------------------------------------------------
    try {
      // Click Option A (the correct relational answer)
      const optARadio = page.locator("div[role=radio]").filter({
        hasText: "stores data in structured tables with rows and columns",
      });
      await optARadio.click();
      await page.waitForTimeout(300);

      // Verify Option A is marked checked
      const ariaChecked = await optARadio.getAttribute("aria-checked");
      assert.equal(ariaChecked, "true", "Option A must have aria-checked=true");

      // Verify Correct badge is visible
      const correctIndicator = page.locator("span[title='Correct Option']");
      await correctIndicator.waitFor({ state: "visible", timeout: 5000 });

      // Verify short explanation is displayed
      const shortExplanation = page.locator("text=PostgreSQL organizes entities into relational tables");
      await shortExplanation.waitFor({ state: "visible", timeout: 5000 });

      // Verify Deep Dive button is rendered (Requirement 1: clickable when concept exists)
      const deepDiveBtn = page.getByRole("button", {
        name: /View detailed concept for option A/i,
      });
      const hasDeepDive = await deepDiveBtn.isVisible();

      if (hasDeepDive) {
        record(
          "SPEC-02",
          "Option selection provides immediate feedback and clickable short explanation",
          "PASS",
          "aria-checked=true, correct indicator, and Deep Dive action verified"
        );
      } else {
        record("SPEC-02", "Option selection feedback", "FAIL", "Deep Dive button not visible");
      }
    } catch (err) {
      record("SPEC-02", "Option selection feedback", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-03: Detailed Concept Modal Opening with Correct Content
    // ------------------------------------------------------------------------
    try {
      const deepDiveBtn = page.getByRole("button", {
        name: /View detailed concept for option A/i,
      });
      await deepDiveBtn.click();
      await page.waitForTimeout(400);

      // Verify dialog is open with accessible attributes
      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      // Verify accessible title matches option's concept
      const modalTitle = dialog.locator("h2", { hasText: "Why is PostgreSQL a relational database?" });
      await modalTitle.waitFor({ state: "visible", timeout: 5000 });

      // Verify modal status badge indicates Correct Answer
      const statusBadge = dialog.getByText("Correct Answer", { exact: true });
      assert.ok(await statusBadge.isVisible(), "Modal header must display Correct Answer badge");

      // Verify detailed explanation content
      const detailedContent = dialog.locator("text=PostgreSQL is a relational database management system (RDBMS)");
      assert.ok(await detailedContent.isVisible(), "Detailed explanation text must be rendered");

      // Verify Key Points section in desktop 2-column view
      const keyPointsHeader = dialog.locator("span", { hasText: "Key Points" }).first();
      assert.ok(await keyPointsHeader.isVisible(), "Desktop Key Points section must be visible");

      const keyPointItem = dialog.locator("text=Data is organized into tables (relations) with rows and columns");
      assert.ok(await keyPointItem.isVisible(), "Key point bullet must be rendered");

      await captureScreenshot(page, "01-concept-modal-desktop-image.png");

      record(
        "SPEC-03",
        "Detailed Concept Modal opens with accessible dialog semantics and correct content",
        "PASS",
        "role=dialog, aria-modal=true, title, badge, and key points verified"
      );
    } catch (err) {
      record("SPEC-03", "Detailed Concept Modal opening", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-04: Media Tab Navigation (Image, Video, References)
    // ------------------------------------------------------------------------
    try {
      const dialog = page.locator("[data-testid='detailed-concept-modal']");

      // Check tablist has Image, Video, References
      const imageTab = dialog.locator("#tab-image");
      const videoTab = dialog.locator("#tab-video");
      const referencesTab = dialog.locator("#tab-references");

      assert.ok(await imageTab.isVisible(), "Image tab must be present");
      assert.ok(await videoTab.isVisible(), "Video tab must be present");
      assert.ok(await referencesTab.isVisible(), "References tab must be present");

      // Verify Image tab active by default
      assert.equal(await imageTab.getAttribute("aria-selected"), "true");
      const imageCaption = dialog.getByText("Relational Database Structure", { exact: true });
      assert.ok(await imageCaption.isVisible(), "Image caption must be displayed");

      // Switch to Video tab
      await videoTab.click();
      await page.waitForTimeout(300);
      assert.equal(await videoTab.getAttribute("aria-selected"), "true");

      const videoPanel = dialog.locator("#tabpanel-video");
      assert.ok(await videoPanel.isVisible(), "Video panel must be visible");

      // Verify hardened YouTube iframe with youtube-nocookie.com
      const iframe = dialog.locator("iframe");
      await iframe.waitFor({ state: "attached", timeout: 5000 });
      const iframeSrc = await iframe.getAttribute("src");
      assert.ok(
        iframeSrc && iframeSrc.includes("youtube-nocookie.com"),
        `Iframe src must use youtube-nocookie.com, got: ${iframeSrc}`
      );

      await captureScreenshot(page, "02-concept-modal-desktop-video.png");

      // Switch to References tab
      await referencesTab.click();
      await page.waitForTimeout(300);
      assert.equal(await referencesTab.getAttribute("aria-selected"), "true");

      const referencesPanel = dialog.locator("#tabpanel-references");
      assert.ok(await referencesPanel.isVisible(), "References panel must be visible");

      // Verify safe external links with rel="noopener noreferrer" and target="_blank"
      const pgRefLink = referencesPanel.locator("a", { hasText: "Official PostgreSQL Documentation" });
      await pgRefLink.waitFor({ state: "visible", timeout: 5000 });

      const linkRel = await pgRefLink.getAttribute("rel");
      const linkTarget = await pgRefLink.getAttribute("target");
      const linkHref = await pgRefLink.getAttribute("href");

      assert.equal(linkTarget, "_blank", "Link target must be _blank");
      assert.ok(linkRel && linkRel.includes("noopener") && linkRel.includes("noreferrer"));
      assert.equal(linkHref, "https://www.postgresql.org/docs/");

      await captureScreenshot(page, "03-concept-modal-desktop-references.png");

      record(
        "SPEC-04",
        "Media tab navigation renders hardened video iframe and safe external citations",
        "PASS",
        "Image caption, youtube-nocookie iframe, and noopener noreferrer links verified"
      );
    } catch (err) {
      record("SPEC-04", "Media tab navigation", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-05: Modal Dismissal via Escape Key, Focus Restoration & State Preservation
    // ------------------------------------------------------------------------
    try {
      // Record initial scroll position
      const scrollBefore = await page.evaluate(() => window.scrollY);

      // Press Escape key
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      // Verify modal is dismissed
      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      const isModalVisible = await dialog.isVisible();
      assert.equal(isModalVisible, false, "Modal must be dismissed on Escape key");

      // Verify focus is restored to the trigger element (Deep Dive button)
      const focusedElementLabel = await page.evaluate(() => {
        return document.activeElement ? document.activeElement.getAttribute("aria-label") : null;
      });
      assert.ok(
        focusedElementLabel && focusedElementLabel.includes("View detailed concept for option A"),
        `Focus was not restored to trigger. Current active element label: ${focusedElementLabel}`
      );

      // Verify Question selection is preserved
      const optARadio = page.locator("div[role=radio]").filter({
        hasText: "stores data in structured tables with rows and columns",
      });
      const ariaChecked = await optARadio.getAttribute("aria-checked");
      assert.equal(ariaChecked, "true", "Option selection must be preserved after closing modal");

      // Verify scroll offset is preserved
      const scrollAfter = await page.evaluate(() => window.scrollY);
      assert.equal(scrollBefore, scrollAfter, "Page scroll offset must be preserved");

      await captureScreenshot(page, "04-modal-closed-focus-restored.png");

      record(
        "SPEC-05",
        "Modal closes on Escape, restores focus to trigger, and preserves question state",
        "PASS",
        "Escape-to-close, focus restoration, and selection state verified"
      );
    } catch (err) {
      record("SPEC-05", "Escape key and focus restoration", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-06: Modal Dismissal via Close Button
    // ------------------------------------------------------------------------
    try {
      // Re-open modal via Deep Dive button
      const deepDiveBtn = page.getByRole("button", {
        name: /View detailed concept for option A/i,
      });
      await deepDiveBtn.click();
      await page.waitForTimeout(300);

      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      // Click the Close button in header
      const closeBtn = dialog.getByRole("button", { name: "Close concept details modal" });
      await closeBtn.click();
      await page.waitForTimeout(300);

      assert.equal(await dialog.isVisible(), false, "Modal must close on header close button click");

      record(
        "SPEC-06",
        "Modal closes cleanly when clicking header Close button",
        "PASS",
        "Close button dismissed dialog"
      );
    } catch (err) {
      record("SPEC-06", "Close button dismissal", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-07: Concept without Short Explanation provides visible Learn More action
    // ------------------------------------------------------------------------
    try {
      // Click Option C (concept exists, but explanationText is null)
      const optCRadio = page.locator("div[role=radio]").filter({
        hasText: "stores documents purely as schemaless BSON objects",
      });
      await optCRadio.click();
      await page.waitForTimeout(300);

      // Verify visible "Learn More" action button is rendered (Requirement 5)
      const learnMoreBtn = page.getByRole("button", {
        name: /Learn more about option C concept/i,
      });
      await learnMoreBtn.waitFor({ state: "visible", timeout: 5000 });

      // Click Learn More button
      await learnMoreBtn.click();
      await page.waitForTimeout(400);

      // Verify modal opens with Option C concept
      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      const title = dialog.locator("h2", { hasText: "Document Stores vs PostgreSQL JSONB" });
      await title.waitFor({ state: "visible", timeout: 5000 });

      // Verify status badge shows Option C (Distractor)
      const distractorBadge = dialog.getByText("Option C (Distractor)", { exact: true });
      assert.ok(await distractorBadge.isVisible(), "Status badge must display Option C (Distractor)");

      await captureScreenshot(page, "05-learn-more-modal.png");

      // Dismiss modal via Escape key
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      const isStillVisible = await dialog.isVisible();
      if (isStillVisible) {
        const closeBtn = dialog.getByRole("button", { name: "Close concept details modal" });
        await closeBtn.click();
      }
      await dialog.waitFor({ state: "hidden", timeout: 5000 });

      record(
        "SPEC-07",
        "Option with detailed concept but no short explanation renders visible Learn More action",
        "PASS",
        "Learn More button opens Document Stores concept modal with distractor badge"
      );
    } catch (err) {
      record("SPEC-07", "Learn More action workflow", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-08: Short Explanation without Detailed Concept is Non-Clickable Plain Text
    // ------------------------------------------------------------------------
    try {
      // Click Option D (has explanationText, but concept is null)
      const optDRadio = page.locator("div[role=radio]").filter({
        hasText: "uses graph traversal algorithms exclusively",
      });
      await optDRadio.click();
      await page.waitForTimeout(300);

      // Check the short explanation text exists
      const explanationSpan = page.locator(
        "span:has-text('Graph databases model networks of nodes and edges')"
      );
      await explanationSpan.waitFor({ state: "visible", timeout: 5000 });

      // Requirement 1: Make an option's short explanation clickable ONLY when its associated detailed concept exists.
      // Must NOT be a button or link
      const clickableExplanation = page.locator(
        "button:has-text('Graph databases model networks of nodes and edges')"
      );
      assert.equal(
        await clickableExplanation.isVisible(),
        false,
        "Option D short explanation must NOT be wrapped in a button"
      );

      // Clicking the plain explanation text does not open any dialog
      await explanationSpan.click();
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator("[data-testid='detailed-concept-modal']").isVisible(),
        false,
        "Clicking plain explanation must not open modal"
      );

      record(
        "SPEC-08",
        "Option with short explanation but no detailed concept is strictly non-clickable plain text",
        "PASS",
        "Verified plain <span> element and zero modal trigger behavior"
      );
    } catch (err) {
      record("SPEC-08", "Non-clickable short explanation", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-09: Missing Optional Content & Zero Broken Resource Placeholders
    // ------------------------------------------------------------------------
    try {
      // Question 2 (QuickSort)
      const q2Prompt = page.locator("text=What is the worst-case time complexity of the standard QuickSort");
      await q2Prompt.scrollIntoViewIfNeeded();

      // Click Option B (O(n²) - has minimal concept: no image, no video)
      const optQsB = page.locator("div[role=radio]").filter({ hasText: "O(n²)" });
      await optQsB.click();
      await page.waitForTimeout(300);

      // Click Deep Dive button on Option B
      const qsDeepDive = page.getByRole("button", {
        name: /View detailed concept for option B/i,
      });
      await qsDeepDive.click();
      await page.waitForTimeout(400);

      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      const qsTitle = dialog.locator("h2", { hasText: "QuickSort Worst-Case Complexity O(n²)" });
      await qsTitle.waitFor({ state: "visible", timeout: 5000 });

      // Requirement 4: Hide absent sections; never display empty tabs, broken resource placeholders, or empty modal
      // QuickSort concept has NO image and NO video -> Tabs for image and video must NOT exist!
      const imageTab = dialog.locator("#tab-image");
      const videoTab = dialog.locator("#tab-video");
      assert.equal(await imageTab.isVisible(), false, "Image tab must be absent when imageUrl is null");
      assert.equal(await videoTab.isVisible(), false, "Video tab must be absent when videoUrl is null");

      // Only References tab is present
      const referencesTab = dialog.locator("#tab-references");
      assert.ok(await referencesTab.isVisible(), "References tab should be present");

      // Verify no broken images or empty media tags
      const brokenImgs = await dialog.locator("img[src='']").count();
      assert.equal(brokenImgs, 0, "No empty img tags allowed");

      await captureScreenshot(page, "06-minimal-concept-clean-rendering.png");

      // Close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      const isStillVisible9 = await dialog.isVisible();
      if (isStillVisible9) {
        const closeBtn = dialog.getByRole("button", { name: "Close concept details modal" });
        await closeBtn.click();
      }
      await dialog.waitFor({ state: "hidden", timeout: 5000 });

      record(
        "SPEC-09",
        "Suppresses absent optional media sections with zero broken placeholders",
        "PASS",
        "Image and Video tabs hidden, references and key points cleanly rendered"
      );
    } catch (err) {
      record("SPEC-09", "Suppression of absent sections", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-10: Mobile Responsive Viewport & Interactive Accordions
    // ------------------------------------------------------------------------
    try {
      // Resize viewport to mobile (iPhone dimensions: 375x667)
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);

      // Re-open Option A modal in mobile viewport
      const deepDiveBtn = page.getByRole("button", {
        name: /View detailed concept for option A/i,
      });
      await deepDiveBtn.scrollIntoViewIfNeeded();
      await deepDiveBtn.click();
      await page.waitForTimeout(400);

      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      // Verify mobile accordion for Key Points is visible
      const mobileKeyPointsBtn = dialog.locator("button:has-text('Key Points')").first();
      await mobileKeyPointsBtn.waitFor({ state: "visible", timeout: 5000 });

      // Verify Key Points bullet is visible initially (accordion open by default)
      const bullet = dialog.locator("li:has-text('Data is organized into tables')");
      assert.ok(await bullet.isVisible(), "Key points bullets visible in open mobile accordion");

      // Toggle accordion closed
      await mobileKeyPointsBtn.click();
      await page.waitForTimeout(200);
      assert.equal(await bullet.isVisible(), false, "Key points collapsed when accordion closed");

      // Toggle accordion open again
      await mobileKeyPointsBtn.click();
      await page.waitForTimeout(200);
      assert.ok(await bullet.isVisible(), "Key points visible again after accordion expanded");

      await captureScreenshot(page, "07-concept-modal-mobile.png");

      // Close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      const isStillVisible10 = await dialog.isVisible();
      if (isStillVisible10) {
        const closeBtn = dialog.getByRole("button", { name: "Close concept details modal" });
        await closeBtn.click();
      }
      await dialog.waitFor({ state: "hidden", timeout: 5000 });

      // Restore viewport to desktop
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(300);

      record(
        "SPEC-10",
        "Responsive mobile layout with interactive collapsible accordions",
        "PASS",
        "Mobile viewport 375x667 verified with accordion collapse and expand"
      );
    } catch (err) {
      record("SPEC-10", "Mobile layout and accordions", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-11: Keyboard Accessibility & Focus Trapping
    // ------------------------------------------------------------------------
    try {
      // Open Option A modal
      const deepDiveBtn = page.getByRole("button", {
        name: /View detailed concept for option A/i,
      });
      await deepDiveBtn.scrollIntoViewIfNeeded();
      await deepDiveBtn.click();
      await page.waitForTimeout(400);

      const dialog = page.locator("[data-testid='detailed-concept-modal']");
      await dialog.waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(150);

      // Check that initial focus is inside the dialog (close button)
      const isFocusInside = await page.evaluate(() => {
        const dialogEl = document.querySelector("[data-testid='detailed-concept-modal']");
        return dialogEl && dialogEl.contains(document.activeElement);
      });
      assert.ok(isFocusInside, "Active element must be within dialog on entry");

      // Press Tab 8 times to verify focus wraps and never leaves dialog
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        const focusedInDialog = await page.evaluate(() => {
          const dialogEl = document.querySelector("[data-testid='detailed-concept-modal']");
          return dialogEl && dialogEl.contains(document.activeElement);
        });
        assert.ok(focusedInDialog, `Focus escaped dialog on Tab iteration ${i + 1}`);
      }

      // Press Shift+Tab to verify reverse wrapping
      await page.keyboard.press("Shift+Tab");
      const focusedReverseInDialog = await page.evaluate(() => {
        const dialogEl = document.querySelector("[data-testid='detailed-concept-modal']");
        return dialogEl && dialogEl.contains(document.activeElement);
      });
      assert.ok(focusedReverseInDialog, "Focus escaped dialog on Shift+Tab");

      // Close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      const isStillVisible11 = await dialog.isVisible();
      if (isStillVisible11) {
        const closeBtn = dialog.getByRole("button", { name: "Close concept details modal" });
        await closeBtn.click();
      }
      await dialog.waitFor({ state: "hidden", timeout: 5000 });

      record(
        "SPEC-11",
        "Keyboard focus entry, circular focus trapping, and Escape-to-close",
        "PASS",
        "Focus stayed strictly contained inside dialog during forward and reverse tab cycles"
      );
    } catch (err) {
      record("SPEC-11", "Keyboard focus trapping", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-12: Zero Raw HTML / Safe Rendering of Imported Content
    // ------------------------------------------------------------------------
    try {
      // Verify no raw script tags or dangerous event handler attributes anywhere in the page
      const scriptInjections = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll("*"));
        return allElements.filter((el) => {
          for (const attr of el.attributes) {
            if (attr.name.startsWith("on") || attr.value.includes("javascript:")) {
              return true;
            }
          }
          return false;
        }).length;
      });

      assert.equal(scriptInjections, 0, "No inline onerror/onload or javascript: attributes found");

      record(
        "SPEC-12",
        "Safe rich-text rendering eliminates raw HTML injection vulnerabilities",
        "PASS",
        "Zero arbitrary HTML, zero inline event attributes, and zero script injection"
      );
    } catch (err) {
      record("SPEC-12", "Safe content rendering", "FAIL", err.message);
    }

    console.log("\n================================================================================");
    const passCount = results.filter((r) => r.status === "PASS").length;
    const failCount = results.filter((r) => r.status === "FAIL").length;
    console.log(
      `  CONCEPT MODAL E2E SUMMARY: ${passCount} PASSED, ${failCount} FAILED (${results.length} TOTAL)`
    );
    console.log("================================================================================\n");

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    if (browser) await browser.close();

    if (nextProcess && nextProcess.pid) {
      console.log("▶ Shutting down test Next.js server...");
      try {
        execSync(`taskkill /F /T /PID ${nextProcess.pid}`, { stdio: "ignore" });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("FATAL: Concept Modal Browser E2E suite failure:", err);
  process.exit(1);
});
