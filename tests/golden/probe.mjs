// Probe: run the real v1.0.1 core on representative scenarios and print
// exact outputs. Used to design and pin down golden test cases.
import { computePlan, targetCents, bounds, FUNDS, CENTS_PER_WAN } from "./core.mjs";

const fmtCents = c => (c / 100).toFixed(2);
const show = (label, input, flow, force = false, options = {}) => {
  console.log("=== " + label + " ===");
  console.log("input(万):", JSON.stringify(input), "flow(万):", flow, "force:", force, "options:", JSON.stringify(options));
  try {
    const p = computePlan(input, flow, force, options);
    console.log("currentTotal:", fmtCents(p.currentTotal), "afterTotal:", fmtCents(p.afterTotal), "flow:", fmtCents(p.flow));
    console.log("flowTrades :", p.flowTrades.map(fmtCents).join(" | "));
    console.log("internal   :", p.internal.map(fmtCents).join(" | "));
    console.log("rounding   :", p.rounding.map(fmtCents).join(" | "));
    console.log("totalTrades:", p.totalTrades.map(fmtCents).join(" | "));
    console.log("final      :", p.final.map(fmtCents).join(" | "));
    console.log("sum(trades)-flow =", p.totalTrades.reduce((s, x) => s + x, 0) - p.flow);
    console.log("weights    :", p.final.map(x => (x / p.afterTotal * 100).toFixed(4) + "%").join(" | "));
    console.log("postFlowBreaches:", JSON.stringify(p.postFlowBreaches), "turnover:", fmtCents(p.internalTurnover));
  } catch (e) {
    console.log("THROWS:", e.message);
  }
  console.log();
};

console.log("FUNDS:", FUNDS.map(f => `${f.code} targetW=${f.targetW} units=${f.units} outer=[${(f.outerLow * 100).toFixed(4)}%,${(f.outerHigh * 100).toFixed(4)}%] inner=[${(f.innerLow * 100).toFixed(4)}%,${(f.innerHigh * 100).toFixed(4)}%]`).join("\n       "));
console.log();

// At-target portfolios at several scales (units 480:320:120:40 = 12:8:3:1)
show("at-target total 96万", [48, 32, 12, 4], 0);
show("at-target total 960万", [480, 320, 120, 40], 0);
show("at-target total 9.6万", [4.8, 3.2, 1.2, 0.4], 0);
show("at-target total 24万", [12, 8, 3, 1], 0);

// Inside band: 002065 slightly overweight but within ±5pp (total 96万)
show("inside band (002065 at 54% < 55%)", [51.84, 27.84, 12, 4.32], 0);
// Boundary construction for 007194: outer high = 1/24 + 1/96 = 5/96 of total
// total 96万 -> high = 5万 exactly
show("007194 exactly at outer high boundary (5万/96万)", [48, 32, 11, 5], 0);
show("007194 1分 above outer high", [47.9999, 32, 11, 5.0001], 0);
// 270048 outer band = target ± 25% => [9.375%, 15.625%]; total 96万 -> low 9万, high 15万
show("270048 exactly at outer low (9万/96万)", [49, 33, 9, 5], 0);
show("270048 1分 below outer low", [49, 33, 8.9999, 5.0001], 0);

// Clear underweight / overweight
show("002065 heavily underweight (30万/96万 = 31.25%)", [30, 38, 18, 10], 0);
show("002065 heavily overweight (70万/96万 = 72.9%)", [70, 14, 8, 4], 0);
show("007194 heavily overweight (20万/96万)", [42, 26, 8, 20], 0);

// Cash flows
show("inflow +48万 into at-target 96万", [48, 32, 12, 4], 48);
show("inflow +1万 into at-target 96万", [48, 32, 12, 4], 1);
show("inflow +0.3万 (3000元, below minTrade) into at-target 96万", [48, 32, 12, 4], 0.3);
show("outflow -24万 from at-target 96万", [48, 32, 12, 4], -24);
show("outflow -1万 from at-target 96万", [48, 32, 12, 4], -1);
show("inflow +48万 into underweight-002065 portfolio", [30, 38, 18, 10], 48);
show("outflow -30万 from overweight-007194 portfolio", [42, 26, 8, 20], -30);

// Internal rebalance (no flow)
show("internal only: 110017 overweight, 002065 underweight", [40, 44, 8, 4], 0);

// Force to target
show("force: skewed portfolio", [30, 38, 18, 10], 0, true);
show("force: skewed + inflow", [30, 38, 18, 10], 48, true);
show("force: skewed + outflow", [70, 14, 8, 4], -20, true);

// Sell policies
show("forbid selling 002065 while it is overweight", [70, 14, 8, 4], 0, false, { sellPolicies: ["forbid", "normal", "normal", "normal"] });
show("avoid selling 002065 while it is overweight", [70, 14, 8, 4], 0, false, { sellPolicies: ["avoid", "normal", "normal", "normal"] });
show("force with forbid on overweight 002065", [70, 14, 8, 4], 0, true, { sellPolicies: ["forbid", "normal", "normal", "normal"] });
show("outflow with forbid on withdraw-preferred sleeves", [48, 32, 12, 4], -24, false, { sellPolicies: ["normal", "normal", "forbid", "forbid"] });

// Rounding / minTrade settings
show("inflow +1万 with roundYuan=1000", [48, 32, 12, 4], 10, false, { roundYuan: 1000 });
show("inflow +1万 with roundYuan=1", [48, 32, 12, 4], 1, false, { roundYuan: 1 });
show("skewed with minTradeYuan=0", [30, 38, 18, 10], 0, false, { minTradeYuan: 0 });
show("skewed with minTradeYuan=100000", [30, 38, 18, 10], 0, false, { minTradeYuan: 100000 });

// Extreme / error paths
show("tiny total (0.0001万 = 1元 each)", [0.0001, 0.0001, 0.0001, 0.0001], 0);
show("zero holdings in one fund", [0, 32, 12, 4], 0);
show("all zero", [0, 0, 0, 0], 0);
show("huge values", [4800000, 3200000, 1200000, 400000], 0);
show("withdraw more than total", [48, 32, 12, 4], -100);
show("withdraw exactly total", [48, 32, 12, 4], -96);
