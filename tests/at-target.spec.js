// 类别 2：已处于目标状态
// 目标比例来自真实代码 FUNDS：1/2 : 1/3 : 1/8 : 1/24（DEN=960 → 480:320:120:40 = 12:8:3:1）
// 选取多个不同倍数构造完全目标组合，验证算法依赖比例关系而非固定金额。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents } from "./helpers.mjs";

// 基础单位 12:8:3:1（万 CNY），取多个不同规模倍数
const SCALES = [0.4, 1, 4, 40, 400];
const atTarget = k => [12 * k, 8 * k, 3 * k, 1 * k];

test.describe("已处于目标状态", () => {
  for (const k of SCALES) {
    const holdings = atTarget(k);
    const total = 24 * k;
    test(`完全目标组合（总额 ${total} 万，比例 12:8:3:1）+ 无资金变动 → 不产生任何交易`, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, { holdings, flow: 0 });
      await generate(page);
      const status = await readStatus(page);
      expect(status.type).toBe("ok");
      const result = await readResult(page);
      // 无外部资金变动时不产生不必要的内部交易或调整
      expect(result.trades).toEqual([0, 0, 0, 0]);
      expect(result.finals).toEqual(holdings.map(wanToCents));
      for (const cls of result.classes) expect(cls).toContain("hold");
      assertInvariants(result, { effectiveCents: holdings.map(wanToCents), flowCents: 0 });
    });
  }

  test("目标组合规模不同但比例一致时行为一致（状态均为 ok、均不操作）", async ({ page }) => {
    // 同一页面顺序验证两种规模，确认无状态残留影响
    for (const k of [2, 8]) {
      const holdings = atTarget(k);
      await page.goto("/");
      await fillPortfolio(page, { holdings, flow: 0 });
      await generate(page);
      const status = await readStatus(page);
      expect(status.type).toBe("ok");
      expect(status.text).toContain("当前持仓在允许区间内，不建议再平衡。");
      const result = await readResult(page);
      expect(result.trades).toEqual([0, 0, 0, 0]);
    }
  });
});
