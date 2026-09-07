// 第七部分：数学不变量（不依赖 UI 文案）
// 对场景矩阵中每个场景，仅从页面渲染结果读取数值并验证：
//   1. 最终总资产 = 初始有效总资产 + 外部资金流
//   2. 所有最终交易净额之和 = 外部资金流
//   3. 单纯内部转换时净交易额 = 0 且总额不变
//   4. 最终各资产金额之和 = 最终总资产（天然由 1 推出，另逐基金核对 持仓+交易=最终）
//   5. 不允许出现非法负持仓
//   6. 禁止卖出的资产不得产生负向最终操作
//   7. 所有输出金额保持整数分精度
//   8. 强制目标模式满足 目标±取整单位 约束
//   9. 汇总区：买入合计 - 卖出合计 = 外部资金流
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readSummary, assertInvariants, wanToCents, parseMoney } from "./helpers.mjs";
import { targetCents } from "./golden/core.mjs";

const AT_TARGET = [48, 32, 12, 4];
const QUANTUM = 100 * 100;

const SCENARIOS = [
  { name: "目标组合无变动", holdings: AT_TARGET, flow: 0 },
  { name: "区间内偏离", holdings: [51.84, 27.84, 12, 4.32], flow: 0 },
  { name: "明显低配", holdings: [30, 38, 18, 10], flow: 0 },
  { name: "明显超配", holdings: [70, 14, 8, 4], flow: 0 },
  { name: "短债超配", holdings: [42, 26, 8, 20], flow: 0 },
  { name: "大额新增", holdings: AT_TARGET, flow: 48 },
  { name: "小额新增", holdings: AT_TARGET, flow: 1 },
  { name: "低于最低交易额的新增", holdings: AT_TARGET, flow: 0.49 },
  { name: "中等取出", holdings: AT_TARGET, flow: -24 },
  { name: "小额取出", holdings: AT_TARGET, flow: -1 },
  { name: "新增叠加低配", holdings: [30, 38, 18, 10], flow: 48 },
  { name: "取出叠加超配", holdings: [42, 26, 8, 20], flow: -30 },
  { name: "内部转换", holdings: [40, 44, 8, 4], flow: 0 },
  { name: "4 位小数输入", holdings: [48.0001, 31.9999, 12, 4], flow: 0 },
  { name: "强制目标", holdings: [30, 38, 18, 10], flow: 0, force: true },
  { name: "强制目标 + 取出", holdings: [70, 14, 8, 4], flow: -20, force: true },
  { name: "尽量不卖 + 取出", holdings: AT_TARGET, flow: -24, policies: ["normal", "normal", "normal", "avoid"] },
  { name: "禁止卖出（低配仍可买入）", holdings: [30, 38, 18, 10], flow: 0, policies: ["forbid", "normal", "normal", "normal"] },
  { name: "在途买入部分修复低配", holdings: [30, 38, 18, 10], flow: 0, pending: [10, 0, 0, 0] },
  { name: "粗取整单位", holdings: AT_TARGET, flow: 10, settings: { roundYuan: 1000 } },
  { name: "最低交易额为 0", holdings: [30, 38, 18, 10], flow: 0, settings: { minTradeYuan: 0 } }
];

test.describe("数学不变量（场景矩阵）", () => {
  for (const s of SCENARIOS) {
    test(s.name, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, s);
      await generate(page, { force: !!s.force });
      const result = await readResult(page);
      const effective = s.holdings.map((h, i) => h + (s.pending?.[i] || 0)).map(wanToCents);
      const flowCents = wanToCents(s.flow);
      const total = effective.reduce((a, b) => a + b, 0) + flowCents;
      assertInvariants(result, {
        effectiveCents: effective,
        flowCents,
        policies: s.policies || null,
        force: !!s.force,
        targetsCents: s.force ? targetCents(total) : null,
        quantumCents: s.force ? (s.settings?.roundYuan ?? 100) * 100 : null
      });
      // 汇总区：买入合计 - 卖出合计 = 外部资金流
      const summary = await readSummary(page);
      expect(parseMoney(summary.sBuy) - parseMoney(summary.sSell)).toBe(flowCents);
      // 汇总区：当前总额 / 变动后总额
      expect(parseMoney(summary.sCurrent)).toBe(effective.reduce((a, b) => a + b, 0));
      expect(parseMoney(summary.sAfter)).toBe(total);
    });
  }
});
