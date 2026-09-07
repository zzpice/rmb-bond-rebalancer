// 类别 10：强制回到目标
// 真实语义（来自代码）：force 模式忽略触发阈值与最小换手，最终金额 = targetCents(afterTotal)
// （最大余数法整数分配），再按取整单位配平，允许 目标±1个取整单位 的偏差。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents } from "./helpers.mjs";
import { targetCents } from "./golden/core.mjs";

const QUANTUM = 100 * 100; // 默认取整单位 100 CNY（分）

const forceCases = [
  { name: "失衡组合、无资金流", holdings: [30, 38, 18, 10], flow: 0 },
  { name: "失衡组合 + 新增 48万", holdings: [30, 38, 18, 10], flow: 48 },
  { name: "超配组合 + 取出 20万", holdings: [70, 14, 8, 4], flow: -20 },
  { name: "已处目标组合（幂等性）", holdings: [48, 32, 12, 4], flow: 0 },
  { name: "非整数规模目标组合", holdings: [50, 30, 11, 5], flow: 0 }
];

test.describe("强制回到目标", () => {
  for (const { name, holdings, flow } of forceCases) {
    test(`${name} → 回到目标比例（±1取整单位）、总额守恒`, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, { holdings, flow });
      await generate(page, { force: true });
      const status = await readStatus(page);
      expect(status.type).toBe("warn");
      expect(status.text).toContain("已按目标比例调整");
      const result = await readResult(page);
      const total = holdings.reduce((s, x) => s + x, 0) + flow;
      assertInvariants(result, {
        effectiveCents: holdings.map(wanToCents),
        flowCents: wanToCents(flow),
        force: true,
        targetsCents: targetCents(wanToCents(total)),
        quantumCents: QUANTUM
      });
      // 最终权重符合 v1.0.1 目标定义：50% / 33.33% / 12.5% / 4.17%（±取整单位折算）
      const expected = [50, 100 / 3, 12.5, 100 / 24];
      const tolerance = QUANTUM / wanToCents(total) * 100 + 1e-6;
      for (let i = 0; i < 4; i++) {
        const w = result.finals[i] / wanToCents(total) * 100;
        expect(Math.abs(w - expected[i])).toBeLessThanOrEqual(tolerance);
      }
    });
  }

  test("强制目标忽略免调整区间：区间内组合也被精确归位", async ({ page }) => {
    // 该组合在免调整区间内（生成建议不调整），但强制模式仍应精确回到目标
    const holdings = [51.84, 27.84, 12, 4.32];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0 });
    await generate(page, { force: true });
    const result = await readResult(page);
    const targets = targetCents(wanToCents(96));
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.finals[i] - targets[i])).toBeLessThanOrEqual(QUANTUM);
    }
    assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0, force: true, targetsCents: targets, quantumCents: QUANTUM });
  });
});
