import { FUNDS, allocateTargets, assertPortfolio, buildBands, sum } from "./portfolio.js";

export function createRebalancePlan({ holdings, flow = 0 }) {
  assertPortfolio(holdings);
  if (!Number.isSafeInteger(flow)) throw new Error("资金变动须精确到 1 CNY。");

  const currentTotal = sum(holdings);
  const finalTotal = currentTotal + flow;
  if (currentTotal <= 0) throw new Error("当前持仓合计必须大于 0。");
  if (finalTotal <= 0) throw new Error("资金变动后的组合总额必须大于 0。");

  const targets = allocateTargets(finalTotal);
  const bands = buildBands(finalTotal, targets);
  const flowTrades = allocateExternalFlow(holdings, targets, flow);
  const postFlow = holdings.map((amount, index) => amount + flowTrades[index]);
  const breaches = postFlow.map((amount, index) => (
    amount < bands[index].low || amount > bands[index].high
  ));

  const final = breaches.some(Boolean)
    ? rebalanceBreaches(postFlow, bands, breaches)
    : postFlow.slice();

  const internalTrades = final.map((amount, index) => amount - postFlow[index]);
  const trades = final.map((amount, index) => amount - holdings[index]);
  const weights = final.map(amount => amount / finalTotal);
  const deviations = weights.map((weight, index) => weight - bands[index].targetWeight);
  const buyTotal = sum(trades.filter(amount => amount > 0));
  const sellTotal = -sum(trades.filter(amount => amount < 0));
  const internalTurnover = sum(internalTrades.filter(amount => amount > 0));
  const tradeCount = trades.filter(Boolean).length;

  const plan = {
    version: 2,
    holdings: holdings.slice(),
    flow,
    currentTotal,
    finalTotal,
    targets,
    bands,
    flowTrades,
    postFlow,
    breaches,
    internalTrades,
    trades,
    final,
    weights,
    deviations,
    buyTotal,
    sellTotal,
    internalTurnover,
    tradeCount,
    mode: internalTurnover > 0 ? "internal" : flow !== 0 ? "flow" : "none"
  };

  assertPlan(plan);
  return plan;
}

export function allocateExternalFlow(holdings, targets, flow) {
  if (flow === 0) return holdings.map(() => 0);
  const direction = Math.sign(flow);
  const capacities = holdings.map((amount, index) => (
    Math.max(0, direction * (targets[index] - amount))
  ));
  const allocation = allocateProportionally(capacities, Math.abs(flow));
  return allocation.map(amount => amount * direction);
}

export function allocateProportionally(capacities, budget) {
  if (!capacities.every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("分配容量必须是非负整数。");
  }
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error("分配金额无效。");
  const capacityTotal = sum(capacities);
  if (budget > capacityTotal) throw new Error("可分配的目标缺口不足。");
  if (budget === 0) return capacities.map(() => 0);

  const denominator = BigInt(capacityTotal);
  const rows = capacities.map((capacity, index) => {
    const numerator = BigInt(budget) * BigInt(capacity);
    return {
      index,
      amount: Number(numerator / denominator),
      remainder: numerator % denominator,
      capacity
    };
  });

  let remaining = budget - sum(rows.map(row => row.amount));
  const order = rows.slice().sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const row of order) {
    if (remaining > 0 && rows[row.index].amount < row.capacity) {
      rows[row.index].amount += 1;
      remaining -= 1;
    }
  }
  if (remaining !== 0) throw new Error("资金尾差分配失败。");
  return rows.map(row => row.amount);
}

function rebalanceBreaches(values, bands, breaches) {
  const final = values.slice();

  values.forEach((amount, index) => {
    if (amount < bands[index].low) final[index] = bands[index].low;
    else if (amount > bands[index].high) final[index] = bands[index].high;
  });

  let gap = sum(values) - sum(final);
  const direction = Math.sign(gap);
  if (!direction) return final;

  const order = values.map((_, index) => index).sort((a, b) => {
    if (Number(breaches[a]) !== Number(breaches[b])) {
      return Number(breaches[b]) - Number(breaches[a]);
    }
    const capacityA = Math.max(0, direction * (bands[a].target - final[a]));
    const capacityB = Math.max(0, direction * (bands[b].target - final[b]));
    return capacityB - capacityA || a - b;
  });

  for (const index of order) {
    const capacity = Math.max(0, direction * (bands[index].target - final[index]));
    const amount = Math.min(Math.abs(gap), capacity);
    final[index] += direction * amount;
    gap -= direction * amount;
    if (gap === 0) break;
  }

  if (gap !== 0) throw new Error("内部再平衡资金未配平。");
  return final;
}

function assertPlan(plan) {
  const {
    holdings, flow, finalTotal, bands, postFlow,
    internalTrades, trades, final
  } = plan;

  if (sum(final) !== finalTotal) throw new Error("最终持仓未与组合总额配平。");
  if (sum(trades) !== flow) throw new Error("执行金额未与资金变动配平。");
  if (sum(internalTrades) !== 0) throw new Error("基金间转换未配平。");

  final.forEach((amount, index) => {
    if (amount < 0) throw new Error(`${FUNDS[index].code} 出现负持仓。`);
    if (holdings[index] + trades[index] !== amount) throw new Error("持仓与交易不一致。");
    if (amount < bands[index].low || amount > bands[index].high) {
      throw new Error(`${FUNDS[index].code} 未回到要求区间。`);
    }
  });

  postFlow.forEach(amount => {
    if (amount < 0) throw new Error("资金变动造成负持仓。");
  });
}
