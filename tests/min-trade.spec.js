// 类别 14：最低交易金额
// 真实逻辑（practicalizePlan）：低于 minTradeYuan（默认 5000 CNY）的“可选”小额交易
// 会被合并消除；但为配平或防止越界所必需的小额交易仍保留，并在执行说明中提示。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents, readExecNote } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];
const MIN_TRADE = 5000 * 100; // 分

test.describe("最低交易金额", () => {
  test("新增资金恰好等于最低交易额（0.5万）→ 合并为单笔 5000 元买入", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0.5 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades).toEqual([MIN_TRADE, 0, 0, 0]);
    const note = await readExecNote(page);
    expect(note).not.toContain("低于最低交易额");
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(0.5) });
  });

  test("新增资金低于最低交易额（0.49万）→ 必要小额交易保留并提示", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0.49 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades.some(t => t !== 0 && Math.abs(t) < MIN_TRADE)).toBe(true);
    const note = await readExecNote(page);
    expect(note).toContain("低于小额交易阈值的必要交易会保留");
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(0.49) });
  });

  test("越界拉回的小额必要交易不因最低交易额而取消（防越界优先）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [48, 32, 10.5, 5.5], flow: 0 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[3]).toBeLessThan(0);
    const total = result.finals.reduce((s, x) => s + x, 0);
    const w3 = result.finals[3] / total * 100;
    expect(w3).toBeLessThanOrEqual(5.2084);
    assertInvariants(result, { effectiveCents: [48, 32, 10.5, 5.5].map(wanToCents), flowCents: 0 });
  });

  test("最低交易额设为 0 → 不再合并，小额交易正常出现", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0.49, settings: { minTradeYuan: 0 } });
    await generate(page);
    const result = await readResult(page);
    const note = await readExecNote(page);
    expect(note).not.toContain("低于小额交易阈值的必要交易会保留");
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(0.49) });
  });

  test("最低交易额非法值被拒绝（-1 / 非整数 / 超范围）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    for (const bad of ["-1", "0.5", "100001"]) {
      await page.locator("#minTradeYuan").fill(bad);
      await generate(page);
      const status = await readStatus(page);
      expect(status.type).toBe("warn");
      expect(status.text).toContain("小额交易阈值须为 0～100,000 CNY 的整数");
    }
  });
});
