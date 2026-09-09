export const VERSION = "2.0.1";
export const YUAN_PER_WAN = 10_000;
export const WEIGHT_SCALE = 10_000;

export const FUNDS = Object.freeze([
  {
    code: "002065",
    name: "景顺长城景盛双息 A",
    fullName: "景顺长城景盛双息收益债券 A",
    category: "固收增强",
    targetBps: 5_000,
    url: "https://www.morningstar.cn/fund/002065.html"
  },
  {
    code: "110017",
    name: "易方达增强回报 A",
    fullName: "易方达增强回报债券 A",
    category: "固收增强",
    targetBps: 3_333,
    url: "https://www.morningstar.cn/fund/110017.html"
  },
  {
    code: "270048",
    name: "广发纯债 A",
    fullName: "广发纯债债券 A",
    category: "纯债",
    targetBps: 1_250,
    url: "https://www.morningstar.cn/fund/270048.html"
  },
  {
    code: "007194",
    name: "长城短债 A",
    fullName: "长城短债债券 A",
    category: "短债",
    targetBps: 417,
    url: "https://www.morningstar.cn/fund/007194.html"
  }
]);

export const REBALANCE_RULE = Object.freeze({
  absoluteBand: 0.05,
  relativeBand: 0.25
});

export class InputError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "InputError";
    this.field = field;
  }
}

export const sum = values => values.reduce((total, value) => total + value, 0);

export function parseWanAmount(value, { label = "金额", allowNegative = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) throw new InputError(`请填写${label}。`);
  if (!/^[+-]?(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(text)) {
    throw new InputError(`${label}须为有效数字，最多保留 4 位小数。`);
  }
  const amount = Math.round(Number(text) * YUAN_PER_WAN);
  if (!Number.isSafeInteger(amount)) throw new InputError(`${label}超出可计算范围。`);
  if (!allowNegative && amount < 0) throw new InputError(`${label}不能为负数。`);
  return amount;
}

export function allocateTargets(total) {
  assertYuan(total, "组合总额");
  if (total <= 0) throw new InputError("组合总额必须大于 0。");

  const denominator = BigInt(WEIGHT_SCALE);
  const rows = FUNDS.map((fund, index) => {
    const numerator = BigInt(total) * BigInt(fund.targetBps);
    return {
      index,
      amount: Number(numerator / denominator),
      remainder: numerator % denominator
    };
  });

  let remaining = total - sum(rows.map(row => row.amount));
  rows
    .slice()
    .sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    })
    .forEach(row => {
      if (remaining > 0) {
        rows[row.index].amount += 1;
        remaining -= 1;
      }
    });

  if (remaining !== 0) throw new Error("目标金额尾差分配失败。");
  return rows.map(row => row.amount);
}

export function buildBands(total, targets = allocateTargets(total)) {
  assertYuan(total, "组合总额");
  if (!Array.isArray(targets) || targets.length !== FUNDS.length) {
    throw new Error("目标金额数量不正确。");
  }

  return FUNDS.map((fund, index) => {
    const targetWeight = fund.targetBps / WEIGHT_SCALE;
    const tolerance = Math.min(
      REBALANCE_RULE.absoluteBand,
      targetWeight * REBALANCE_RULE.relativeBand
    );
    const target = targets[index];

    return {
      target,
      targetWeight,
      tolerance,
      lowWeight: targetWeight - tolerance,
      highWeight: targetWeight + tolerance,
      low: Math.min(target, Math.max(0, Math.ceil(total * (targetWeight - tolerance) - 1e-9))),
      high: Math.max(target, Math.floor(total * (targetWeight + tolerance) + 1e-9))
    };
  });
}

export function snapshot(amounts) {
  assertPortfolio(amounts);
  const total = sum(amounts);
  if (total <= 0) throw new InputError("当前持仓合计必须大于 0。");
  const targets = allocateTargets(total);
  const bands = buildBands(total, targets);
  const rows = amounts.map((amount, index) => {
    const weight = amount / total;
    const deviation = weight - bands[index].targetWeight;
    const breached = amount < bands[index].low || amount > bands[index].high;
    return { amount, weight, deviation, breached, target: targets[index], band: bands[index] };
  });
  return { total, targets, bands, rows, breached: rows.some(row => row.breached) };
}

export function assertPortfolio(amounts) {
  if (!Array.isArray(amounts) || amounts.length !== FUNDS.length) {
    throw new InputError(`请填写全部 ${FUNDS.length} 只基金的当前持仓。`);
  }
  amounts.forEach((amount, index) => {
    assertYuan(amount, FUNDS[index].code);
    if (amount < 0) throw new InputError(`${FUNDS[index].code} 当前持仓不能为负数。`);
  });
}

function assertYuan(value, label) {
  if (!Number.isSafeInteger(value)) throw new InputError(`${label}须精确到 1 CNY。`);
}
