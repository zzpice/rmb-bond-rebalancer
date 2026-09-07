// 类别 5+6+9：明显低配、明显超配、无资金流的内部再平衡
// 预期方向与落点规则来自真实代码：越界基金拉回内边界（目标与外边界的 50% 处），
// 内部买卖严格配平，组合总额不变。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents } from "./helpers.mjs";

const QUANTUM = 100 * 100; // 默认取整单位 100 CNY（分）
const BOUNDS_96 = [
  { innerLow: wanToCents(45.6), innerHigh: wanToCents(50.4) },
  { innerLow: wanToCents(29.6), innerHigh: wanToCents(34.4) },
  { innerLow: wanToCents(10.5), innerHigh: wanToCents(13.5) },
  { innerLow: wanToCents(3.5), innerHigh: wanToCents(4.5) }
];

test.describe("明显低配场景", () => {
  test("002065 明显低配（30万/96万 = 31.25%）→ 买入拉回，方向正确", async ({ page }) => {
    const holdings = [30, 38, 18, 10];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page);
    const status = await readStatus(page);
    expect(status.type).toBe("warn"); // 越界后被拉回安全位置
    expect(status.text).toContain("002065");
    const result = await readResult(page);
    expect(result.trades[0]).toBeGreaterThan(0); // 低配基金被买入
    // 其余超配基金被卖出配平
    expect(result.trades[1]).toBeLessThan(0);
    expect(result.trades[2]).toBeLessThan(0);
    expect(result.trades[3]).toBeLessThan(0);
    // 落点：002065 被拉到内下界 innerLow（47.5%）
    expect(Math.abs(result.finals[0] - BOUNDS_96[0].innerLow)).toBeLessThanOrEqual(QUANTUM);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
  });

  test("某只基金持仓为 0 → 视为极端低配，买入建立仓位", async ({ page }) => {
    const holdings = [0, 32, 12, 4];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[0]).toBeGreaterThan(0);
    expect(Math.abs(result.finals[0] - wanToCents(22.8))).toBeLessThanOrEqual(QUANTUM);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
  });
});

test.describe("明显超配场景", () => {
  test("002065 明显超配（70万/96万 = 72.9%）→ 卖出拉回，方向正确", async ({ page }) => {
    const holdings = [70, 14, 8, 4];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page);
    const status = await readStatus(page);
    expect(status.type).toBe("warn");
    expect(status.text).toContain("002065");
    const result = await readResult(page);
    expect(result.trades[0]).toBeLessThan(0); // 超配基金被卖出
    // 落点：内上界 innerHigh（52.5%）
    expect(Math.abs(result.finals[0] - BOUNDS_96[0].innerHigh)).toBeLessThanOrEqual(QUANTUM);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
  });

  test("007194 明显超配（20万/96万 = 20.8%）→ 卖出，买入低配基金", async ({ page }) => {
    const holdings = [42, 26, 8, 20];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[3]).toBeLessThan(0);
    expect(Math.abs(result.finals[3] - BOUNDS_96[3].innerHigh)).toBeLessThanOrEqual(QUANTUM);
    // 买入方向：低配基金获得买入
    expect(result.trades[0] + result.trades[1] + result.trades[2]).toBeGreaterThan(0);
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
  });
});

test.describe("内部再平衡（无外部资金流）", () => {
  test("110017 超配 + 002065 低配 → 内部转换严格配平、总额不变", async ({ page }) => {
    const holdings = [40, 44, 8, 4];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page);
    const result = await readResult(page);
    const sum = a => a.reduce((s, x) => s + x, 0);
    // 内部买入和卖出严格配平
    const buys = sum(result.trades.filter(x => x > 0));
    const sells = -sum(result.trades.filter(x => x < 0));
    expect(buys).toBe(sells);
    expect(buys).toBeGreaterThan(0);
    // 组合总金额不因内部转换而变化
    expect(sum(result.finals)).toBe(sum(holdings.map(wanToCents)));
    expect(result.trades[0]).toBeGreaterThan(0); // 买入低配
    expect(result.trades[1]).toBeLessThan(0); // 卖出超配
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
  });
});
