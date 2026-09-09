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

  const final = flow < 0
    ? postFlow.slice()
    : breaches.some(Boolean)
      ? rebalanceToReentry(postFlow, bands)
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
  if (flow < 0) {
    return allocateWithdrawal(holdings, targets, -flow).map(amount => -amount);
  }
  const capacities = holdings.map((amount, index) => (
    Math.max(0, targets[index] - amount)
  ));
  return allocateProportionally(capacities, flow);
}

function allocateWithdrawal(holdings, finalTargets, budget) {
  const sells = holdings.map(() => 0);
  let remaining = budget;
  const currentBands = buildBands(sum(holdings));
  const finalBands = buildBands(sum(holdings) - budget, finalTargets);
  const wasHigh = holdings.map((amount, index) => amount > currentBands[index].high);

  const takeProportionally = capacities => {
    const take = Math.min(remaining, sum(capacities));
    if (!take) return;
    const allocation = allocateProportionally(capacities, take);
    allocation.forEach((amount, index) => { sells[index] += amount; });
    remaining -= take;
  };

  takeProportionally(holdings.map((amount, index) => (
    wasHigh[index] ? Math.max(0, amount - finalBands[index].high) : 0
  )));

  const afterBoundary = holdings.map((amount, index) => amount - sells[index]);
  takeProportionally(afterBoundary.map((amount, index) => (
    wasHigh[index] ? Math.max(0, amount - finalTargets[index]) : 0
  )));

  for (const index of [3, 2]) {
    if (!remaining) break;
    const take = Math.min(remaining, holdings[index] - sells[index]);
    sells[index] += take;
    remaining -= take;
  }

  if (remaining) {
    takeProportionally([
      holdings[0] - sells[0],
      holdings[1] - sells[1],
      0,
      0
    ]);
  }

  if (remaining) throw new Error("可取出金额不足。");
  return sells;
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

function rebalanceToReentry(values, bands) {
  const final = values.slice();

  values.forEach((amount, index) => {
    if (amount < bands[index].reentryLow) final[index] = bands[index].reentryLow;
    else if (amount > bands[index].reentryHigh) final[index] = bands[index].reentryHigh;
  });

  const gap = sum(values) - sum(final);
  const direction = Math.sign(gap);
  if (!direction) return final;

  const capacities = final.map((amount, index) => (
    Math.max(0, direction * (bands[index].target - amount))
  ));
  const allocation = allocateProportionally(capacities, Math.abs(gap));
  allocation.forEach((amount, index) => {
    final[index] += direction * amount;
  });

  return final;
}

function assertPlan(plan) {
  const {
    holdings, flow, finalTotal, bands, breaches, postFlow,
    internalTrades, trades, final
  } = plan;

  if (sum(final) !== finalTotal) throw new Error("最终持仓未与组合总额配平。");
  if (sum(trades) !== flow) throw new Error("执行金额未与资金变动配平。");
  if (sum(internalTrades) !== 0) throw new Error("基金间转换未配平。");
  if (flow < 0 && internalTrades.some(Boolean)) throw new Error("取出资金不应产生基金间转换。");

  final.forEach((amount, index) => {
    if (amount < 0) throw new Error(`${FUNDS[index].code} 出现负持仓。`);
    if (holdings[index] + trades[index] !== amount) throw new Error("持仓与交易不一致。");
    if (flow >= 0 && (amount < bands[index].low || amount > bands[index].high)) {
      throw new Error(`${FUNDS[index].code} 未回到触发区间。`);
    }
    if (
      flow >= 0
      && breaches.some(Boolean)
      && (amount < bands[index].reentryLow || amount > bands[index].reentryHigh)
    ) {
      throw new Error(`${FUNDS[index].code} 未进入 80% 回调区间。`);
    }
  });

  postFlow.forEach(amount => {
    if (amount < 0) throw new Error("资金变动造成负持仓。");
  });
}
