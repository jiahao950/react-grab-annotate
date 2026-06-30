import { test, expect } from "@playwright/test";

// Exercises the annotation product flow on the dedicated demo page
// (apps/e2e-app-vite/annotate.html), which boots react-grab with
// `{ annotate: true }`. Requires the annotate-server (port 5179), started by
// the Playwright webServer config.
test.describe("Annotation mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/annotate.html", { waitUntil: "networkidle" });
  });

  const entryButton = (page: import("@playwright/test").Page) =>
    page.locator(".rga-btn-primary", { hasText: "标注" });
  const cancelButton = (page: import("@playwright/test").Page) =>
    page.locator(".rga-btn-secondary", { hasText: "取消" });
  const submitButton = (page: import("@playwright/test").Page) =>
    page.locator(".rga-btn-primary", { hasText: "Submit" });

  const annotate = async (page: import("@playwright/test").Page, comment: string) => {
    const target = page.getByText("Todo List", { exact: true }).first();
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(150);
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const input = page.locator("[data-react-grab-input]").first();
    await input.fill(comment);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
  };

  test("shows a single entry button, then Cancel + Submit when active", async ({ page }) => {
    await expect(entryButton(page)).toBeVisible();
    await entryButton(page).click();
    await expect(cancelButton(page)).toBeVisible();
    await expect(submitButton(page)).toBeVisible();
  });

  test("creates a numbered mark with source location on comment submit", async ({ page }) => {
    await entryButton(page).click();
    await annotate(page, "把这个标题放大并加粗");

    const mark = page.locator(".rga-mark");
    await expect(mark).toHaveCount(1);
    await expect(mark.first()).toHaveText("1");

    await mark.first().click();
    await expect(page.locator(".rga-card")).toBeVisible();
    await expect(page.locator(".rga-card-loc")).toContainText(":");
  });

  test("Escape closes the comment popup without exiting annotation mode", async ({ page }) => {
    await entryButton(page).click();
    const target = page.getByText("Todo List", { exact: true }).first();
    const box = await target.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // Still in annotation mode: Cancel + Submit remain.
    await expect(submitButton(page)).toBeVisible();
  });

  test("Submit copies a prompt pointing at the saved file and clears marks", async ({ page }) => {
    await entryButton(page).click();
    await annotate(page, "调整间距");
    await expect(page.locator(".rga-mark")).toHaveCount(1);

    await submitButton(page).click();
    await page.waitForTimeout(800);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("条标注信息保存到");
    expect(clipboard).toContain("annotations.md");

    // Marks cleared and back to the single entry button.
    await expect(page.locator(".rga-mark")).toHaveCount(0);
    await expect(entryButton(page)).toBeVisible();
  });
});
