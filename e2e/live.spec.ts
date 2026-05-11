/**
 * End-to-end tests that drive the live deployment with a real headless browser,
 * exactly the way a reviewer would test it.
 *
 *   npm run test:e2e
 *
 * Override the URL for local testing:
 *   TARGET_URL=http://localhost:3000 npm run test:e2e
 *
 * Skips automatically if TARGET_URL is unreachable so it doesn't break CI when
 * the live deployment is down.
 */

import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const TARGET = process.env.TARGET_URL ?? "https://treasury-app-eosin.vercel.app";
const FIXTURES = path.resolve(__dirname, "../samples");
const SCREENSHOTS = path.resolve(__dirname, "../docs/screenshots");

async function fillSingleForm(
  page: Page,
  app: Record<string, string>,
  filename: string,
) {
  await page.selectOption('select', app.beverageClass ?? "spirits");
  await page.locator('input[type="text"]').nth(0).fill(app.brandName);
  await page.locator('input[type="text"]').nth(1).fill(app.classType);
  await page.locator('input[type="text"]').nth(2).fill(app.alcoholContent);
  await page.locator('input[type="text"]').nth(3).fill(app.netContents);
  await page.locator('input[type="text"]').nth(4).fill(app.producer);
  if (app.originCountry) {
    await page.locator('input[type="text"]').nth(5).fill(app.originCountry);
  }
  await page.setInputFiles(
    'input[type="file"]',
    path.join(FIXTURES, filename),
  );
}

test.describe("Live deployment — reviewer flow", () => {
  test("single label — happy path (OLD TOM DISTILLERY passes)", async ({
    page,
  }) => {
    await page.goto(TARGET);
    await expect(page).toHaveTitle(/TTB Label Verifier/);
    await expect(page.getByText("Alcohol Label Verifier")).toBeVisible();

    await fillSingleForm(
      page,
      {
        brandName: "OLD TOM DISTILLERY",
        classType: "Kentucky Straight Bourbon Whiskey",
        alcoholContent: "45% Alc./Vol.",
        netContents: "750 mL",
        producer: "Old Tom Distillery, Bardstown, KY",
        beverageClass: "spirits",
      },
      "old-tom.jpg",
    );

    await page.getByRole("button", { name: /Verify label/ }).click();
    await expect(page.getByText("All checks passed")).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(SCREENSHOTS, "result-pass.png"),
      fullPage: true,
    });
  });

  test("single label — strict Government Warning fail (title case)", async ({
    page,
  }) => {
    await page.goto(TARGET);
    await fillSingleForm(
      page,
      {
        brandName: "OLD TOM DISTILLERY",
        classType: "Kentucky Straight Bourbon Whiskey",
        alcoholContent: "45% Alc./Vol.",
        netContents: "750 mL",
        producer: "Old Tom Distillery, Bardstown, KY",
        beverageClass: "spirits",
      },
      "altered-warning.jpg",
    );

    await page.getByRole("button", { name: /Verify label/ }).click();
    await expect(page.getByText("Issues found")).toBeVisible({
      timeout: 15_000,
    });
    // Warning row should be FAIL with a note about all-caps requirement.
    await expect(
      page.getByText(/not 'GOVERNMENT WARNING:' in all caps/i),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS, "result-fail-case.png"),
      fullPage: true,
    });
  });

  test("single label — wine-under-14% ABV exemption", async ({ page }) => {
    await page.goto(TARGET);
    await fillSingleForm(
      page,
      {
        brandName: "MEADOWBROOK CELLARS",
        classType: "Chardonnay",
        alcoholContent: "12.5% Alc./Vol.",
        netContents: "750 mL",
        producer: "Meadowbrook Cellars, Sonoma, CA",
        beverageClass: "wine",
      },
      "wine-low-abv-missing.jpg",
    );

    await page.getByRole("button", { name: /Verify label/ }).click();
    // Wine with no ABV on the label is N/A, not a fail.
    await expect(page.getByText("All checks passed")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("batch mode — CSV + image folder", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(TARGET);
    await page.getByRole("button", { name: /Batch/i }).click();
    await expect(page.getByText(/Upload application CSV/i)).toBeVisible();

    await page.setInputFiles(
      'input[type="file"][accept*="csv"]',
      path.join(FIXTURES, "applications.csv"),
    );
    const batchFiles = [
      "old-tom.jpg",
      "chateau-margaux.jpg",
      "wine-low-abv.jpg",
      "wine-low-abv-missing.jpg",
      "beer-ipa.jpg",
      "altered-warning.jpg",
      "regular-warning.jpg",
      "wrong-abv.jpg",
      "riverstone-ai.jpg",
    ];
    await page.setInputFiles(
      'input[type="file"][multiple]',
      batchFiles.map((f) => path.join(FIXTURES, f)),
    );

    await page.getByRole("button", { name: /Verify all/i }).click();

    // After all rows finish, the Export button transitions from disabled to
    // enabled. Poll with a generous timeout that survives slow OpenRouter calls.
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.includes("Export results CSV"),
        );
        return btn instanceof HTMLButtonElement && !btn.disabled;
      },
      undefined,
      { timeout: 150_000 },
    );

    // 5 expected passes + 4 expected fails (altered, regular, wrong-abv, AI typo).
    await expect(page.getByText(/5 pass/i)).toBeVisible();
    await expect(page.getByText(/4 fail/i)).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS, "batch-results.png"),
      fullPage: true,
    });
  });
});
