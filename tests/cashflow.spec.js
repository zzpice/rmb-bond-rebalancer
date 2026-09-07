// 类别 7+8：新增资金与取出资金
// 真实规则（来自代码与页面文案）：新增优先补低配基金；取出优先使用短债和纯债
// （withdrawRank：007194=0 最优先，270048=1，增强仓=2），再考虑固收增强。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, readSummary, assertInvariants, wanToCents, parseMoney } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("新增资金", () => {
  const inflowCases = [
    { name: "小额新增 +1万", flow: 1 },
    { name: "中等新增 +24万", flow: 24 },
    { name: "大额新增 +48万（总额 50%）", flow: 48 }
  ];
  for (const { name, flow } of inflowCases) {
    test(`${name} → 总额正确、交易净额与资金流严格配平、全部买入`, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, { holdings: AT_TARGET, flow });
      await generate(page);
      const result = await readResult(page);
      const sum = a => a.reduce((s, x) => s + x, 0);
      // 最终总资产正确
      expect(sum(result.finals)).toBe(wanToCents(96 + flow));
      // 最终交易净额与外部资金流严格配平
      expect(sum(result.trades)).toBe(wanToCents(flow));
      // 新增资金只买入不卖出
      for (const t of result.trades) expect(t).toBeGreaterThanOrEqual(0);
      assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(flow) });
      // 汇总区“变动后总额”一致
      const summary = await readSummary(page);
      expect(parseMoney(summary.sAfter)).toBe(wanToCents(96 + flow));
    });
  }

  test("新增资金优先补低配基金（低配组合 +48万）", async ({ page }) => {
    const holdings = [30, 38, 18, 10]; // 002065 低配
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 48 });
    await generate(page);
    const result = await readResult(page);
    // 低配基金获得最大买入
    expect(result.trades[0]).toBeGreaterThan(result.trades[1]);
    expect(result.trades[0]).toBeGreaterThan(result.trades[2]);
    expect(result.trades[0]).toBeGreaterThan(result.trades[3]);
    // 低配得到纠正：002065 回到区间内（45%～55%）
    const w0 = result.finals[0] / (96 + 48) / 1e4;
    expect(w0).toBeGreaterThanOrEqual(45);
    expect(w0).toBeLessThanOrEqual(55);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: wanToCents(48) });
  });
});

test.describe("取出资金", () => {
  const outflowCases = [
    { name: "小额取出 -1万", flow: -1 },
    { name: "中等取出 -24万", flow: -24 },
    { name: "大额取出 -48万（总额 50%）", flow: -48 }
  ];
  for (const { name, flow } of outflowCases) {
    test(`${name} → 总额正确、交易净额与资金流严格配平、全部卖出`, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, { holdings: AT_TARGET, flow });
      await generate(page);
      const result = await readResult(page);
      const sum = a => a.reduce((s, x) => s + x, 0);
      expect(sum(result.finals)).toBe(wanToCents(96 + flow));
      expect(sum(result.trades)).toBe(wanToCents(flow));
      for (const t of result.trades) expect(t).toBeLessThanOrEqual(0);
      assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(flow) });
    });
  }

  test("小额取出优先使用短债仓（-1万 全部来自 007194）", async ({ page }) => {
    // 真实行为（代码中 withdrawalPenalty 按 withdrawRank 排序：短债 0 最优先）
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -1 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[3]).toBe(wanToCents(-1));
    expect(result.trades[0]).toBe(0);
    expect(result.trades[1]).toBe(0);
    expect(result.trades[2]).toBe(0);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(-1) });
  });

  test("较大取出先用短债和纯债，再考虑固收增强（-24万）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -24 });
    await generate(page);
    const result = await readResult(page);
    // 短债(007194)与纯债(270048)被取至各自外边界下限：3.125% 与 9.375%
    const total = wanToCents(72);
    const w3 = result.finals[3] / total * 100;
    const w2 = result.finals[2] / total * 100;
    expect(Math.abs(w3 - 3.125)).toBeLessThan(0.01);
    expect(Math.abs(w2 - 9.375)).toBeLessThan(0.01);
    // 短债纯债取尽后才动用增强仓
    expect(result.trades[3]).toBeLessThan(0);
    expect(result.trades[2]).toBeLessThan(0);
    assertInvariants(result, { effectiveCents: AT_TARGET.map(wanToCents), flowCents: wanToCents(-24) });
  });

  test("取出叠加超配基金：优先从越界基金纠偏（-30万，007194 超配）", async ({ page }) => {
    const holdings = [42, 26, 8, 20];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: -30 });
    await generate(page);
    const status = await readStatus(page);
    // 资金纠偏后无越界 → ok 状态
    expect(status.type).toBe("ok");
    const result = await readResult(page);
    // 超配的 007194 承担最大卖出
    expect(-result.trades[3]).toBeGreaterThan(-result.trades[0]);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: wanToCents(-30) });
  });
});
