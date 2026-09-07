// 类别 1：页面基础可用性
import { test, expect } from "@playwright/test";
import { FUND_CODES, FUND_NAMES } from "./helpers.mjs";

test.describe("页面基础可用性", () => {
  test("页面正常加载且无致命 JavaScript 错误", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", e => pageErrors.push(String(e)));
    page.on("console", msg => {
      if (msg.type() === "error" && !/service.?worker/i.test(msg.text())) consoleErrors.push(msg.text());
    });
    await page.goto("/");
    await expect(page).toHaveTitle(/债基再平衡助手/);
    await expect(page.locator("h1")).toContainText("债基再平衡助手");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("四只真实基金全部出现，名称与代码正确", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("#fundBody .fund-card");
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i)).toContainText(FUND_NAMES[i]);
      await expect(cards.nth(i)).toContainText(FUND_CODES[i]);
    }
  });

  test("核心输入与操作入口可用", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".amount")).toHaveCount(4);
    await expect(page.locator("#cashFlow")).toBeVisible();
    await expect(page.locator("#check")).toBeVisible();
    await expect(page.locator("#force")).toBeVisible();
    await expect(page.locator("#clear")).toBeVisible();
    await page.locator(".special-panel > summary").click();
    await expect(page.locator(".pending")).toHaveCount(4);
    await expect(page.locator(".sell-policy")).toHaveCount(4);
  });

  test("高级设置默认值与代码 DEFAULTS 一致", async ({ page }) => {
    await page.goto("/");
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    await expect(page.locator("#absoluteBandPP")).toHaveValue("5");
    await expect(page.locator("#relativeBandPct")).toHaveValue("25");
    await expect(page.locator("#landingPct")).toHaveValue("50");
    await expect(page.locator("#roundYuan")).toHaveValue("100");
    await expect(page.locator("#minTradeYuan")).toHaveValue("5000");
  });

  test("目标比例与免调整范围说明按真实代码渲染", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#targetSummary")).toContainText("50%");
    await expect(page.locator("#targetSummary")).toContainText("33.33%");
    await expect(page.locator("#targetSummary")).toContainText("12.50%");
    await expect(page.locator("#targetSummary")).toContainText("4.17%");
    await expect(page.locator("#outerRule")).toContainText("5/25");
    await expect(page.locator("#innerRule")).toContainText("50%");
  });

  test("manifest 与 service-worker 文件可访问", async ({ page, request }) => {
    await page.goto("/");
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const sw = await request.get("/service-worker.js");
    expect(sw.ok()).toBe(true);
    const swText = await sw.text();
    expect(swText).toContain('CACHE_PREFIX="bond-rebalancer-"');
    expect(swText).toContain("v1.2.0");
  });
});
