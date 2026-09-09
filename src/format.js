export function formatCurrency(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : value < 0 ? "−" : "";
  const amount = Math.abs(Math.round(value)).toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  });
  return `${sign}CNY ${amount}`;
}

export function formatWan(value) {
  if (!Number.isFinite(value)) return "—";
  const wan = value / 10_000;
  return `${wan.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} 万`;
}

export function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;
}

export function formatSignedPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return prefix + formatPercent(Math.abs(value), digits);
}
