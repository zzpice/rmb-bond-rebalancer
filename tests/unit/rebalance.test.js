import test from "node:test";
import assert from "node:assert/strict";
import { FUNDS, sum } from "../../src/portfolio.js";
import {
  allocateProportionally,
  createRebalancePlan
} from "../../src/rebalance.js";

const TARGET_MILLION = [500_000, 333_300, 125_000, 41_700];

function minimumRequiredTurnover(plan) {
  if (!plan.breaches.some(Boolean)) return 0;
  const sellNeed = sum(plan.postFlow.map((amount, index) => (
    Math.max(0, amount - plan.bands[index].reentryHigh)
  )));
  const buyNeed = sum(plan.postFlow.map((amount, index) => (
    Math.max(0, plan.bands[index].reentryLow - amount)
  )));
  return Math.max(sellNeed, buyNeed);
}

test("外层区间内不交易；只有严格越界才进入 80% 回调区间", () => {
  const targetPlan = createRebalancePlan({ holdings: TARGET_MILLION, flow: 0 });
  assert.equal(targetPlan.mode, "none");
  assert.deepEqual(targetPlan.trades, [0, 0, 0, 0]);
  assert.deepEqual(targetPlan.final, TARGET_MILLION);

  const hysteresisPlan = createRebalancePlan({
    holdings: [545_000, 288_300, 125_000, 41_700],
    flow: 0
  });
  assert.equal(hysteresisPlan.breaches.some(Boolean), false);
  assert.deepEqual(hysteresisPlan.trades, [0, 0, 0, 0]);
  assert.deepEqual(hysteresisPlan.final, hysteresisPlan.postFlow);
  assert.ok(hysteresisPlan.final[0] > hysteresisPlan.bands[0].reentryHigh);
  assert.ok(hysteresisPlan.final[1] < hysteresisPlan.bands[1].reentryLow);
});

test("新增资金只用于补足目标缺口且不制造内部转换", () => {
  const plan = createRebalancePlan({ holdings: TARGET_MILLION, flow: 10_000 });
  assert.equal(plan.mode, "flow");
  assert.ok(plan.trades.every(value => value >= 0));
  assert.equal(sum(plan.trades), 10_000);
  assert.equal(plan.internalTurnover, 0);
  assert.deepEqual(plan.final, plan.targets);
});

test("取出资金按已有高配、短债、纯债、增强债顺序分配且不内部转换", () => {
  const cases = [
    {
      holdings: [600_000, 399_960, 150_000, 50_040],
      flow: -20_000,
      trades: [0, 0, 0, -20_000]
    },
    {
      holdings: [600_000, 399_960, 150_000, 50_040],
      flow: -80_000,
      trades: [0, 0, -29_960, -50_040]
    },
    {
      holdings: [680_000, 350_000, 120_000, 50_000],
      flow: -200_000,
      trades: [-180_000, 0, 0, -20_000]
    },
    {
      holdings: [661_000, 460_000, 59_000, 20_000],
      flow: -100_000,
      trades: [-58_815, -41_185, 0, 0]
    },
    {
      holdings: [600_000, 399_960, 150_000, 50_040],
      flow: -600_000,
      trades: [-239_986, -159_974, -150_000, -50_040]
    }
  ];

  for (const input of cases) {
    const plan = createRebalancePlan(input);
    assert.equal(plan.mode, "flow");
    assert.deepEqual(plan.trades, input.trades);
    assert.ok(plan.trades.every(value => value <= 0));
    assert.equal(sum(plan.trades), input.flow);
    assert.deepEqual(plan.internalTrades, [0, 0, 0, 0]);
    assert.equal(plan.internalTurnover, 0);
  }
});

test("刚越过外层 1 CNY 时进入 80% 回调区间并保持最小换手", () => {
  const plan = createRebalancePlan({
    holdings: [550_001, 283_300, 124_999, 41_700],
    flow: 0
  });
  assert.deepEqual(plan.breaches, [true, false, false, false]);
  assert.equal(plan.internalTurnover, 10_001);
  assert.equal(plan.internalTurnover, minimumRequiredTurnover(plan));
  assert.deepEqual(plan.final, [540_000, 293_301, 124_999, 41_700]);
  plan.final.forEach((amount, index) => {
    assert.ok(amount >= plan.bands[index].reentryLow);
    assert.ok(amount <= plan.bands[index].reentryHigh);
  });
  assert.equal(sum(plan.trades), 0);
});

test("同样最小换手的可行解按剩余目标缺口比例配平", () => {
  const plan = createRebalancePlan({
    holdings: [650_000, 350_000, 40_000, 160_000],
    flow: 0
  });

  assert.deepEqual(plan.breaches, [false, false, true, true]);
  assert.deepEqual(plan.trades, [-2_000, 14_263, 87_689, -99_952]);
  assert.deepEqual(plan.final, [648_000, 364_263, 127_689, 60_048]);
  assert.equal(plan.internalTurnover, 101_952);
  assert.equal(plan.internalTurnover, minimumRequiredTurnover(plan));
  plan.final.forEach((amount, index) => {
    assert.ok(amount >= plan.bands[index].reentryLow);
    assert.ok(amount <= plan.bands[index].reentryHigh);
  });
});

test("极端资金流仍保持守恒与非负；取现不追加内部转换", () => {
  const cases = [
    { holdings: TARGET_MILLION, flow: 20_000_000 },
    { holdings: TARGET_MILLION, flow: -999_999 },
    { holdings: [1_000_000, 0, 0, 0], flow: -1 }
  ];

  for (const input of cases) {
    const plan = createRebalancePlan(input);
    assert.equal(sum(plan.final), plan.finalTotal);
    assert.equal(sum(plan.trades), input.flow);
    assert.equal(sum(plan.internalTrades), 0);
    assert.ok(plan.final.every(value => value >= 0));

    if (input.flow < 0) {
      assert.deepEqual(plan.internalTrades, [0, 0, 0, 0]);
      assert.equal(plan.internalTurnover, 0);
    } else {
      assert.equal(plan.internalTurnover, minimumRequiredTurnover(plan));
      plan.final.forEach((amount, index) => {
        assert.ok(amount >= plan.bands[index].low && amount <= plan.bands[index].high);
        if (plan.breaches.some(Boolean)) {
          assert.ok(amount >= plan.bands[index].reentryLow);
          assert.ok(amount <= plan.bands[index].reentryHigh);
        }
      });
    }
  }
});

test("比例分配使用整数金额且稳定处理尾差", () => {
  const allocation = allocateProportionally([3, 2, 1, 0], 5);
  assert.deepEqual(allocation, [2, 2, 1, 0]);
  assert.equal(sum(allocation), 5);
  assert.throws(() => allocateProportionally([1, 0], 2), /不足/);
});

test("随机场景始终满足金额守恒、回调最小换手与各资金流路径不变量", () => {
  let seed = 0x2a4f91c3;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };

  for (let scenario = 0; scenario < 2_000; scenario += 1) {
    const holdings = FUNDS.map(() => Math.floor(random() * 2_000_000));
    if (sum(holdings) === 0) holdings[0] = 1;
    const currentTotal = sum(holdings);
    const flow = random() < 0.5
      ? -Math.floor(random() * currentTotal)
      : Math.floor(random() * (currentTotal * 20 + 1));
    const plan = createRebalancePlan({ holdings, flow });

    assert.equal(sum(plan.final), currentTotal + flow);
    assert.equal(sum(plan.trades), flow);
    assert.equal(sum(plan.internalTrades), 0);
    assert.ok(plan.final.every(Number.isSafeInteger));
    assert.ok(plan.final.every(value => value >= 0));
    plan.final.forEach((value, index) => {
      assert.equal(value, holdings[index] + plan.trades[index]);
    });

    if (flow < 0) {
      assert.ok(plan.flowTrades.every(value => value <= 0));
      assert.deepEqual(plan.internalTrades, [0, 0, 0, 0]);
      assert.equal(plan.internalTurnover, 0);
    } else {
      assert.equal(plan.internalTurnover, minimumRequiredTurnover(plan));
      plan.final.forEach((value, index) => {
        const band = plan.bands[index];
        assert.ok(value >= band.low && value <= band.high);
        if (plan.breaches.some(Boolean)) {
          assert.ok(value >= band.reentryLow && value <= band.reentryHigh);
        }
      });
      if (flow > 0) assert.ok(plan.flowTrades.every(value => value >= 0));
      if (!plan.breaches.some(Boolean)) assert.deepEqual(plan.final, plan.postFlow);
    }
  }
});
