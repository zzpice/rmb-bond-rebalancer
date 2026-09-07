// Probe round 2: avoid-priority, pending-trade equivalents, minTrade edges.
import { computePlan } from "./core.mjs";

const fmtCents = c => (c / 100).toFixed(2);
const show = (label, input, flow, force = false, options = {}) => {
  console.log("=== " + label + " ===");
  console.log("input(万):", JSON.stringify(input), "flow:", flow, "force:", force, "options:", JSON.stringify(options));
  try {
    const p = computePlan(input, flow, force, options);
    console.log("flowTrades :", p.flowTrades.map(fmtCents).join(" | "));
    console.log("internal   :", p.internal.map(fmtCents).join(" | "));
    console.log("rounding   :", p.rounding.map(fmtCents).join(" | "));
    console.log("totalTrades:", p.totalTrades.map(fmtCents).join(" | "));
    console.log("final      :", p.final.map(fmtCents).join(" | "));
    console.log("weights    :", p.final.map(x => (x / p.afterTotal * 100).toFixed(4) + "%").join(" | "));
    console.log("postFlowBreaches:", JSON.stringify(p.postFlowBreaches), "turnover:", fmtCents(p.internalTurnover), "smallRequired:", JSON.stringify(p.smallRequired));
  } catch (e) {
    console.log("THROWS:", e.message);
  }
  console.log();
};

// avoid-priority: two funds overweight; the "avoid" one should be sold after the normal one.
show("002065+270048 both overweight; 270048=avoid", [55, 12, 17, 12], 0, false, { sellPolicies: ["normal", "normal", "avoid", "normal"] });
show("same portfolio all normal", [55, 12, 17, 12], 0);
// avoid on the only fund that could absorb outflow
show("outflow -24万; 007194=avoid, others normal", [48, 32, 12, 4], -24, false, { sellPolicies: ["normal", "normal", "normal", "avoid"] });
show("outflow -24万; all avoid except 007194", [48, 32, 12, 4], -24, false, { sellPolicies: ["avoid", "avoid", "avoid", "normal"] });

// forbid on underweight fund does NOT block buying
show("002065 underweight + forbid (buy still allowed)", [30, 38, 18, 10], 0, false, { sellPolicies: ["forbid", "normal", "normal", "normal"] });

// pending-equivalent portfolios (page adds pending to confirmed before computePlan)
// confirmed [48,32,12,4] + pending buy +2万 on 270048 -> effective [48,32,14,4]
show("effective after pending buy: [48,32,14,4]", [48, 32, 14, 4], 0);
// confirmed [48,32,12,4] + pending sell -1.5万 on 110017 -> effective [48,30.5,12,4]
show("effective after pending sell: [48,30.5,12,4]", [48, 30.5, 12, 4], 0);
// pending buy on underweight 002065: confirmed [30,38,18,10] + pending +10万 -> [40,38,18,10]
show("effective pending buy partially heals: [40,38,18,10]", [40, 38, 18, 10], 0);

// minTrade edges: inflow exactly at / below minTrade on at-target portfolio
show("inflow +0.5万 (exactly minTrade 5000元)", [48, 32, 12, 4], 0.5);
show("inflow +0.49万 (below minTrade)", [48, 32, 12, 4], 0.49);
// tiny breach pull-back below minTrade
show("007194 breach by 0.5万 (pull-back 2500元 < minTrade)", [48, 32, 10.5, 5.5], 0);

// rounding conservation with awkward quantum
show("outflow -7.77万 roundYuan=100", [48, 32, 12, 4], -7.77);
show("inflow +3.33万 roundYuan=100", [48, 32, 12, 4], 3.33);
show("inflow +3.33万 roundYuan=10000", [48, 32, 12, 4], 3.33, false, { roundYuan: 10000 });

// 4-decimal input precision
show("4-decimal inputs at target", [48.0001, 31.9999, 12, 4], 0);
// 5-decimal input should throw
show("5-decimal input", [48.00001, 32, 12, 4], 0);
