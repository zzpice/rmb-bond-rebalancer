// Golden-case generator: runs the REAL v1.0.1 core (extracted verbatim from
// index.html) on representative scenarios and pins the outputs to cases.json.
// The JSON is committed; golden.spec.js asserts the live page reproduces these
// exact values. Re-run manually ONLY when intentionally re-baselining.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computePlan } from "./core.mjs";

// UI-level inputs. pending 在页面端会计入有效持仓，这里用 effective 计算期望。
const CASES = [
  { name: "完全处于目标状态", holdings: [48, 32, 12, 4], flow: 0 },
  { name: "免调整区间内部", holdings: [51.84, 27.84, 12, 4.32], flow: 0 },
  { name: "恰好在免调整边界", holdings: [48, 32, 11, 5], flow: 0 },
  { name: "刚刚越界（1 元）", holdings: [47.9999, 32, 11, 5.0001], flow: 0 },
  { name: "明显低配", holdings: [30, 38, 18, 10], flow: 0 },
  { name: "明显超配", holdings: [70, 14, 8, 4], flow: 0 },
  { name: "大额新增资金", holdings: [48, 32, 12, 4], flow: 48 },
  { name: "小额新增资金（含取整配平）", holdings: [48, 32, 12, 4], flow: 1 },
  { name: "中等取出资金", holdings: [48, 32, 12, 4], flow: -24 },
  { name: "小额取出资金（短债优先）", holdings: [48, 32, 12, 4], flow: -1 },
  { name: "内部再平衡", holdings: [40, 44, 8, 4], flow: 0 },
  { name: "强制回到目标", holdings: [30, 38, 18, 10], flow: 0, force: true },
  { name: "强制回到目标 + 取出", holdings: [70, 14, 8, 4], flow: -20, force: true },
  { name: "尽量不卖 + 取出", holdings: [48, 32, 12, 4], flow: -24, policies: ["normal", "normal", "normal", "avoid"] },
  { name: "在途买入部分修复低配", holdings: [30, 38, 18, 10], flow: 0, pending: [10, 0, 0, 0] },
  { name: "取整配平（非整倍资金流）", holdings: [48, 32, 12, 4], flow: 3.33 },
  { name: "零持仓基金建仓", holdings: [0, 32, 12, 4], flow: 0 },
  { name: "禁止卖出的低配基金仍买入", holdings: [30, 38, 18, 10], flow: 0, policies: ["forbid", "normal", "normal", "normal"] }
];

const out = CASES.map(c => {
  const effective = c.holdings.map((h, i) => h + (c.pending?.[i] || 0));
  const plan = computePlan(effective, c.flow, !!c.force, {
    sellPolicies: c.policies,
    roundYuan: c.settings?.roundYuan,
    minTradeYuan: c.settings?.minTradeYuan
  });
  return {
    name: c.name,
    input: {
      holdings: c.holdings,
      flow: c.flow,
      force: !!c.force,
      pending: c.pending || null,
      policies: c.policies || null,
      settings: c.settings || null
    },
    expected: {
      trades: plan.totalTrades,
      finals: plan.final
    }
  };
});

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "cases.json");
writeFileSync(file, JSON.stringify({ generatedFrom: "v1.0.1 (index.html, commit 23438d9)", cases: out }, null, 2) + "\n");
console.log(`wrote ${out.length} golden cases to ${file}`);
