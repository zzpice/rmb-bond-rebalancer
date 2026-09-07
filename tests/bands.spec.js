// 类别 3+4：免调整区间与边界值
// 免调整区间规则来自真实代码：outerBand = min(5个百分点, 目标×25%)，边界为闭区间
// （bounds(): low=ceil(total*outerLow-1e-7), high=floor(total*outerHigh+1e-7)；
//   outerBreaches(): x<low || x>high，恰好等于边界不触发）。
// 本文件所有边界值都用 v1.0.1 真实代码（tests/golden/core.mjs）现场计算，不预设数值。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, wanToCents } from "./helpers.mjs";
import { bounds, targetCents, outerBreaches } from "./golden/core.mjs";

const TOTAL_WAN = 96;
const totalCents = wanToCents(TOTAL_WAN);
const b = bounds(totalCents);
const t = targetCents(totalCents);
const ONE_YUAN = 100; // 分；页面输入最小精度 0.0001 万 = 1 元

//  donor 基金：把差额转移给宽限带内的其他基金，保持总额不变
const DONORS = { 0: [1, 2], 1: [0, 2], 2: [0], 3: [0] };

function buildAtBoundary(k, which, epsilonCents = 0) {
  const amounts = [...t];
  const boundValue = b[k][which] + epsilonCents;
  const delta = boundValue - amounts[k];
  amounts[k] = boundValue;
  // 差额分摊到 donor 基金。页面输入精度为 1 元（0.0001 万），
  // 分摊必须保持整元，否则构造值会在录入时被四舍五入而改变。
  const donors = DONORS[k];
  const sign = Math.sign(delta);
  const share = Math.floor(Math.abs(delta) / donors.length / 100) * 100;
  for (let d = 0; d < donors.length; d++) {
    const take = d === donors.length - 1 ? delta - sign * share * d : sign * share;
    amounts[donors[d]] -= take;
  }
  return amounts;
}

const centsToWan = c => (c / 1e6).toFixed(4);

test.describe("免调整区间（区间内部）", () => {
  // 每只基金在区间内部（靠近边界但未触边）时不应触发任何调整
  const insideCases = [
    { name: "002065 高配但在区间内（54%）", build: () => buildAtBoundary(0, "high", -wanToCents(0.96)) },
    { name: "002065 低配但在区间内（46%）", build: () => buildAtBoundary(0, "low", wanToCents(0.96)) },
    { name: "270048 高配但在区间内", build: () => buildAtBoundary(2, "high", -ONE_YUAN) },
    { name: "270048 低配但在区间内", build: () => buildAtBoundary(2, "low", ONE_YUAN) },
    { name: "007194 高配但在区间内", build: () => buildAtBoundary(3, "high", -ONE_YUAN) },
    { name: "007194 低配但在区间内", build: () => buildAtBoundary(3, "low", ONE_YUAN) }
  ];
  for (const { name, build } of insideCases) {
    test(name + " → 不调整", async ({ page }) => {
      const amounts = build();
      // 用真实代码确认构造前提：确实无任何越界
      expect(outerBreaches(amounts)).toEqual([false, false, false, false]);
      await page.goto("/");
      await fillPortfolio(page, { holdings: amounts.map(centsToWan), flow: 0 });
      await generate(page);
      const status = await readStatus(page);
      expect(status.type).toBe("ok");
      const result = await readResult(page);
      expect(result.trades).toEqual([0, 0, 0, 0]);
      expect(result.finals).toEqual(amounts);
    });
  }
});

test.describe("边界值（精确边界与边界内外最小变化）", () => {
  for (const k of [0, 1, 2, 3]) {
    for (const which of ["low", "high"]) {
      test(`基金 ${k} 恰好等于${which === "low" ? "下" : "上"}边界 → 不触发（边界为闭区间）`, async ({ page }) => {
        const amounts = buildAtBoundary(k, which, 0);
        expect(outerBreaches(amounts)).toEqual([false, false, false, false]);
        await page.goto("/");
        await fillPortfolio(page, { holdings: amounts.map(centsToWan), flow: 0 });
        await generate(page);
        const status = await readStatus(page);
        expect(status.type).toBe("ok");
        const result = await readResult(page);
        expect(result.trades).toEqual([0, 0, 0, 0]);
      });

      test(`基金 ${k} 越过${which === "low" ? "下" : "上"}边界 1 元 → 触发调整`, async ({ page }) => {
        const epsilon = which === "low" ? -ONE_YUAN : ONE_YUAN;
        const amounts = buildAtBoundary(k, which, epsilon);
        const breaches = outerBreaches(amounts);
        expect(breaches[k]).toBe(true); // 用真实代码确认确实越界
        await page.goto("/");
        await fillPortfolio(page, { holdings: amounts.map(centsToWan), flow: 0 });
        await generate(page);
        const result = await readResult(page);
        // 越界后必须产生调整：至少一只基金有非零交易，且越界基金被拉回
        expect(result.trades.some(x => x !== 0)).toBe(true);
        if (which === "low") expect(result.trades[k]).toBeGreaterThan(0);
        else expect(result.trades[k]).toBeLessThan(0);
        // 金额守恒
        const sum = a => a.reduce((s, x) => s + x, 0);
        expect(sum(result.finals)).toBe(totalCents);
        expect(sum(result.trades)).toBe(0);
      });
    }
  }

  test("越界 1 元时拉回量与拉回规则一致（007194 实例，验证 >=/> 无混用）", async ({ page }) => {
    // 007194 恰在上边界（5万）不触发；+1元触发，拉回到内上界 innerHigh
    const atBound = buildAtBoundary(3, "high", 0);
    const over = buildAtBoundary(3, "high", ONE_YUAN);
    await page.goto("/");
    await fillPortfolio(page, { holdings: atBound.map(centsToWan), flow: 0 });
    await generate(page);
    expect((await readResult(page)).trades).toEqual([0, 0, 0, 0]);

    await page.goto("/");
    await fillPortfolio(page, { holdings: over.map(centsToWan), flow: 0 });
    await generate(page);
    const result = await readResult(page);
    // v1.0.1 真实语义：越界基金被拉到内边界 innerHigh（取整后允许一个取整单位内的偏差）
    const quantum = 100 * 100; // 默认取整单位 100 CNY
    expect(Math.abs(result.finals[3] - b[3].innerHigh)).toBeLessThanOrEqual(quantum);
    expect(result.trades[3]).toBeLessThan(0);
  });
});
