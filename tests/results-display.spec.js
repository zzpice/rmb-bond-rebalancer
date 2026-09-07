import { test, expect } from "@playwright/test";
import { FUND_CODES, FUND_NAMES, fillPortfolio, generate } from "./helpers.mjs";

test.describe("结果展示与基金映射", () => {
  test("执行表、计算说明和仓位摘要映射到正确字段", async ({ page }) => {
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
      "已确认金额",
      "尚未确认的交易",
      "新增／取出资金分配",
      "基金之间转换",
      "取整与小额合并",
      "最终操作"
    ]);
    await expect(detailRows.nth(1).locator("td").nth(3)).toHaveText("买入 CNY 89,218.65");
    await expect(detailRows.nth(1).locator("td").nth(4)).toHaveText("买入 CNY 118,343.85");
    await expect(resultRows.nth(1).locator("td").nth(1)).toHaveText("买入 CNY 207,500.00");
    await expect(page.locator("#roleSummary")).toHaveText(
      "交易后：固收增强仓 85.28%，纯债及短债防守仓 14.72%。"
    );
  });
});
