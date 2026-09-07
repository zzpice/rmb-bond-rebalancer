import { test, expect } from "@playwright/test";
import { FUND_CODES, FUND_NAMES, fillPortfolio, generate } from "./helpers.mjs";

test.describe("结果展示与基金映射", () => {
  test("执行表与计算说明映射到正确字段", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 10 });
    await generate(page);

    const resultRows = page.locator("#resultBody tr");
    const detailRows = page.locator("#detailBody tr");
    for (let i = 0; i < FUND_CODES.length; i++) {
      await expect(resultRows.nth(i).locator("td").nth(0)).toContainText(FUND_NAMES[i]);
      await expect(resultRows.nth(i).locator("td").nth(0)).toContainText(FUND_CODES[i]);
      await expect(detailRows.nth(i).locator("td").nth(0)).toContainText(FUND_NAMES[i]);
      await expect(detailRows.nth(i).locator("td").nth(0)).toContainText(FUND_CODES[i]);
    }

    const detailHeadings = await page.locator(".detail-table th").allTextContents();
    expect(detailHeadings).toEqual([
      "基金",
      "当前持仓",
      "在途交易",
      "资金变动分配",
      "基金间转换",
      "取整调整",
      "最终操作"
    ]);
    await expect(detailRows.nth(1).locator("td").nth(3)).toHaveText("买入 CNY 89,218.65");
    await expect(detailRows.nth(1).locator("td").nth(4)).toHaveText("买入 CNY 118,343.85");
    await expect(resultRows.nth(1).locator("td").nth(1)).toHaveText("买入 CNY 207,500.00");
  });
});
