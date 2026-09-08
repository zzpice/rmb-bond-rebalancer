import { test, expect } from "@playwright/test";
import { fillPortfolio, generate } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("v1.5.0 Patch 1 结构整理", () => {
  test("计算过程归入结果区并形成三级计算明细", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#resultsCard #detailBody")).toHaveCount(1);
    await expect(page.locator(".detail-table")).toHaveCount(1);
    expect(await page.locator(".detail-table").evaluate(table => table.closest("#resultsCard") !== null)).toBe(true);
    await expect(page.locator(".result-details > summary")).toHaveText("查看计算明细");
    await expect(page.locator(".result-details h4")).toHaveText(["汇总", "术语说明", "逐基金推导"]);

    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0, pending: [0, 0, 2, 0] });
    await generate(page);
    await page.locator(".result-details > summary").click();
    await expect(page.locator("#detailBody tr")).toHaveCount(4);
    await expect(page.locator("#detailBody tr").nth(2).locator("td").nth(2)).toHaveText("买入 CNY 20,000.00");
  });

  test("删除页脚重复免责声明并保留执行金额风险提示", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footer-risk")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("不构成投资建议");

    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#executionRiskNote")).toBeVisible();
    await expect(page.locator("#executionRiskNote")).toHaveText("执行金额仅供参考，未计入相关费用及确认期间的净值变化。");
  });

  test("高级设置保持原位置、完整功能与降级视觉", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const settings = page.locator("details.settings-card");
    await expect(settings).toHaveCount(1);
    expect(await settings.evaluate(element => {
      const cash = document.getElementById("cashFlowSection");
      const dock = document.querySelector(".action-dock");
      return Boolean(cash.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(element.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(settings.locator(":scope > summary")).toContainText("高级设置");
    await expect(settings.locator(":scope > summary")).toContainText("触发阈值、取整单位与小额交易阈值，一般无需修改");

    const desktopStyle = await settings.evaluate(element => {
      const card = getComputedStyle(element), summary = getComputedStyle(element.querySelector("summary"));
      return { boxShadow: card.boxShadow, radius: card.borderRadius, marginTop: card.marginTop, fontSize: summary.fontSize, fontWeight: summary.fontWeight };
    });
    expect(desktopStyle).toEqual({ boxShadow: "none", radius: "12px", marginTop: "10px", fontSize: "15px", fontWeight: "650" });

    await settings.locator(":scope > summary").click();
    await expect(settings.locator("input.setting")).toHaveCount(5);
    for (const field of await settings.locator("input.setting").all()) await expect(field).toBeVisible();
    await page.locator("#absoluteBandPP").fill("2");
    await page.locator("#restoreDefaults").click();
    await expect(page.locator("#absoluteBandPP")).toHaveValue("5");

    await page.setViewportSize({ width: 375, height: 844 });
    const mobileStyle = await settings.locator(":scope > summary").evaluate(element => {
      const style = getComputedStyle(element);
      return { minHeight: style.minHeight, fontSize: style.fontSize };
    });
    expect(mobileStyle).toEqual({ minHeight: "48px", fontSize: "15px" });
  });
});
