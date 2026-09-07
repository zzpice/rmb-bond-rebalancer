// 类别 13：取整
// 真实逻辑：建议金额按 roundYuan（默认 100 CNY）取整；配平差额由残余基金吸收；
// 取整前后金额严格守恒，且取整后不得违反区间约束。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents, readExecNote } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("取整", () => {
  test("默认取整单位 100 CNY：所有交易金额均为 100 的整数倍", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 3.33 });
    await generate(page);
    const result = await readResult(page);
    const quantum = 100 * 100;
    for (const t of result.trades) expect(t % quantum).toBe(0);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(3.33) });
  });

  test("取整单位改为 1 CNY：结果更接近理论值且仍守恒", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 1, settings: { roundYuan: 1 } });
    await generate(page);
    const result = await readResult(page);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(1) });
  });

  test("取整单位改为 10000 CNY：粗取整下仍守恒且不越界", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 3.33, settings: { roundYuan: 10000 } });
    await generate(page);
    const result = await readResult(page);
    const quantum = 10000 * 100;
    const nonMultiples = result.trades.filter(t => t % quantum !== 0);
    expect(nonMultiples.length).toBeLessThanOrEqual(1);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(3.33) });
    const total = result.finals.reduce((s, x) => s + x, 0);
    const w0 = result.finals[0] / total * 100;
    expect(w0).toBeGreaterThanOrEqual(45);
    expect(w0).toBeLessThanOrEqual(55);
  });

  test("取出场景取整：交易净额仍与资金流严格配平", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -7.77 });
    await generate(page);
    const result = await readResult(page);
    const quantum = 100 * 100;
    for (const t of result.trades) expect(Math.abs(t % quantum)).toBe(0);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(-7.77) });
  });

  test("执行说明包含取整单位提示", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 3.33, settings: { roundYuan: 500 } });
    await generate(page);
    const note = await readExecNote(page);
    expect(note).toContain("按 500 CNY 取整");
  });

  test("取整单位非法值被拒绝（0 / 非整数 / 超范围）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    for (const bad of ["0", "1.5", "10001"]) {
      await page.locator("#roundYuan").fill(bad);
      await generate(page);
      const status = await readStatus(page);
      expect(status.type).toBe("warn");
      expect(status.text).toContain("取整单位须为 1～10,000 CNY 的整数");
    }
  });
});
