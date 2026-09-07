import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, wanToCents } from "./helpers.mjs";

test.describe("高级阈值设置会改变真实计算", () => {
  test("absoluteBandPP=2 缩窄主仓绝对免调整区间", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, {
      holdings: [51, 29, 12, 4],
      flow: 0,
      settings: { absoluteBandPP: 2 }
    });
    await generate(page);

    await expect(page.locator("#outerRule")).toContainText("2/25");
    const result = await readResult(page);
    expect(result.trades).toEqual([-2.04, 2.04, 0, 0].map(wanToCents));
    expect(result.finals).toEqual([48.96, 31.04, 12, 4].map(wanToCents));
  });

  test("relativeBandPct=10 缩窄短债相对免调整区间", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, {
      holdings: [47.5, 32, 12, 4.5],
      flow: 0,
      settings: { relativeBandPct: 10 }
    });
    await generate(page);

    await expect(page.locator("#outerRule")).toContainText("5/10");
    const result = await readResult(page);
    expect(result.trades).toEqual([0.3, 0, 0, -0.3].map(wanToCents));
    expect(result.finals).toEqual([47.8, 32, 12, 4.2].map(wanToCents));
  });

  test("landingPct=80 决定越界后的实际落点", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, {
      holdings: [47.5, 32, 12, 4.5],
      flow: 0,
      settings: { relativeBandPct: 10, landingPct: 80 }
    });
    await generate(page);

    await expect(page.locator("#innerRule")).toContainText("80%");
    const result = await readResult(page);
    expect(result.trades).toEqual([0.18, 0, 0, -0.18].map(wanToCents));
    expect(result.finals).toEqual([47.68, 32, 12, 4.32].map(wanToCents));
  });
});
