import test from "node:test";
import assert from "node:assert/strict";
import {
  FUNDS,
  allocateTargets,
  buildBands,
  parseWanAmount,
  snapshot,
  sum
} from "../../src/portfolio.js";

test("目标比例使用整数基点并严格合计为 100%", () => {
  assert.equal(sum(FUNDS.map(fund => fund.targetBps)), 10_000);
  assert.deepEqual(allocateTargets(1_000_000), [500_000, 333_300, 125_000, 41_700]);
});

test("最大余数法在任意整数总额下保持目标金额守恒", () => {
  for (const total of [1, 7, 99, 100, 10_001, 987_654_321]) {
    const targets = allocateTargets(total);
    assert.equal(sum(targets), total);
    assert.ok(targets.every(Number.isSafeInteger));
  }
});

test("5 / 25 外层触发与 80% 回调区间使用统一公式", () => {
  const bands = buildBands(1_000_000);
  assert.equal(bands[0].lowWeight, 0.45);
  assert.equal(bands[0].highWeight, 0.55);
  assert.ok(Math.abs(bands[0].reentryLowWeight - 0.46) < 1e-12);
  assert.ok(Math.abs(bands[0].reentryHighWeight - 0.54) < 1e-12);

  assert.equal(bands[1].lowWeight, 0.2833);
  assert.equal(bands[1].highWeight, 0.3833);
  assert.ok(Math.abs(bands[1].reentryLowWeight - 0.2933) < 1e-12);
  assert.ok(Math.abs(bands[1].reentryHighWeight - 0.3733) < 1e-12);

  assert.equal(bands[2].lowWeight, 0.09375);
  assert.equal(bands[2].highWeight, 0.15625);
  assert.ok(Math.abs(bands[2].reentryLowWeight - 0.1) < 1e-12);
  assert.ok(Math.abs(bands[2].reentryHighWeight - 0.15) < 1e-12);

  assert.ok(Math.abs(bands[3].lowWeight - 0.031275) < 1e-12);
  assert.ok(Math.abs(bands[3].highWeight - 0.052125) < 1e-12);
  assert.ok(Math.abs(bands[3].reentryLowWeight - 0.03336) < 1e-12);
  assert.ok(Math.abs(bands[3].reentryHighWeight - 0.05004) < 1e-12);
});

test("边界属于安全区间，越过 1 CNY 才触发", () => {
  const onBoundary = snapshot([550_000, 283_300, 125_000, 41_700]);
  assert.equal(onBoundary.rows[0].breached, false);
  const outside = snapshot([550_001, 283_300, 124_999, 41_700]);
  assert.equal(outside.rows[0].breached, true);
});

test("万 CNY 输入精确到 1 CNY，并拒绝负持仓与过多小数", () => {
  assert.equal(parseWanAmount("12.3456"), 123_456);
  assert.equal(parseWanAmount("-1.5", { allowNegative: true }), -15_000);
  assert.throws(() => parseWanAmount("-1"), /不能为负数/);
  assert.throws(() => parseWanAmount("1.00001"), /最多保留 4 位小数/);
  assert.throws(() => parseWanAmount(""), /请填写/);
});
