// Shared helpers for the v1.0.1 black-box test baseline.
// Locators are derived from the real v1.0.1 DOM (verified by inspection):
//   - 4 holding inputs: .amount (rendered in FUNDS order)
//   - 4 pending inputs: .pending (inside the "在途交易、赎回限制与比例详情" panel)
//   - 4 policy selects: .sell-policy (same panel)
//   - cash flow: #cashFlow; actions: #check / #force
//   - results: #resultBody rows; status: #status .statusbox(ok|warn|bad)
import { expect } from "@playwright/test";

export const FUND_CODES = ["002065", "110017", "270048", "007194"];
export const FUND_NAMES = [
  "景顺长城景盛双息 A",
  "易方达增强回报 A",
  "广发纯债 A",
  "长城短债 A"
];

// "CNY 1,234.56" -> integer cents
export function parseMoney(text) {
  const m = String(text).replace(/[,\s]/g, "").match(/CNY(-?\d+(?:\.\d+)?)/);
  if (!m) throw new Error("cannot parse money: " + text);
  return Math.round(Number(m[1]) * 100);
}

// "买入 CNY x" / "卖出 CNY x" / "不操作" -> signed integer cents
export function parseTrade(text) {
  const t = String(text);
  if (t.includes("不操作")) return 0;
  const cents = parseMoney(t);
  return t.includes("卖出") ? -cents : cents;
}

export async function openSettings(page) {
  await page.locator("details.card > summary", { hasText: "高级设置" }).click();
}

export async function openSpecialPanel(page) {
  await page.locator(".special-panel > summary").click();
}

// settings: { absoluteBandPP?, relativeBandPct?, landingPct?, roundYuan?, minTradeYuan? }
export async function applySettings(page, settings) {
  if (!settings) return;
  await openSettings(page);
  for (const [id, value] of Object.entries(settings)) {
    await page.locator("#" + id).fill(String(value));
  }
}

// Drives the real page like a user. All money inputs are in 万 CNY.
export async function fillPortfolio(page, { holdings, flow = null, pending = null, policies = null, settings = null }) {
  await applySettings(page, settings);
  if (pending || policies) await openSpecialPanel(page);
  if (pending) {
    for (let i = 0; i < pending.length; i++) {
      if (pending[i] !== null && pending[i] !== undefined) {
        await page.locator(".pending").nth(i).fill(String(pending[i]));
      }
    }
  }
  if (policies) {
    for (let i = 0; i < policies.length; i++) {
      if (policies[i]) await page.locator(".sell-policy").nth(i).selectOption(policies[i]);
    }
  }
  for (let i = 0; i < holdings.length; i++) {
    if (holdings[i] !== null && holdings[i] !== undefined) {
      await page.locator(".amount").nth(i).fill(String(holdings[i]));
    }
  }
  if (flow !== null) await page.locator("#cashFlow").fill(String(flow));
}

export async function generate(page, { force = false } = {}) {
  await page.locator(force ? "#force" : "#check").click();
}

// Reads the real result table. Returns integer cents arrays + weight strings.
export async function readResult(page) {
  const rows = page.locator("#resultBody tr");
  await expect(rows).toHaveCount(4);
  const trades = [], finals = [], weights = [], classes = [];
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    const tradeCell = row.locator("td").nth(1);
    trades.push(parseTrade(await tradeCell.textContent()));
    classes.push((await tradeCell.getAttribute("class")) || "");
    finals.push(parseMoney(await row.locator("td").nth(2).textContent()));
    weights.push(await row.locator("td").nth(3).textContent());
  }
  return { trades, finals, weights, classes };
}

export async function readStatus(page) {
  const box = page.locator("#status .statusbox").first();
  await expect(box).toBeVisible();
  const cls = (await box.getAttribute("class")) || "";
  const type = cls.includes("ok") ? "ok" : cls.includes("warn") ? "warn" : cls.includes("bad") ? "bad" : "unknown";
  return { type, text: await box.textContent() };
}

export async function readSummary(page) {
  const out = {};
  for (const id of ["sCurrent", "sAfter", "sBreach", "sTurnover", "sBuy", "sSell"]) {
    out[id] = await page.locator("#" + id).textContent();
  }
  return out;
}

export async function readExecNote(page) {
  return (await page.locator("#execNote").textContent()) || "";
}

// Mathematical invariants from the task spec, evaluated purely on values read
// from the rendered page. effectiveCents: confirmed+pending per fund.
export function assertInvariants({ trades, finals }, { effectiveCents, flowCents, policies = null, force = false, targetsCents = null, quantumCents = null }) {
  const sum = a => a.reduce((s, x) => s + x, 0);
  // 最终总资产 = 初始有效总资产 + 外部资金流
  expect(sum(finals)).toBe(sum(effectiveCents) + flowCents);
  // 所有最终交易净额之和 = 外部资金流
  expect(sum(trades)).toBe(flowCents);
  // 单纯内部转换时净交易额 = 0，且组合总金额不变
  if (flowCents === 0) {
    expect(sum(finals)).toBe(sum(effectiveCents));
  }
  // 不允许出现非法负持仓
  for (const f of finals) expect(f).toBeGreaterThanOrEqual(0);
  // 最终各资产金额 = 原持仓 + 交易
  for (let i = 0; i < 4; i++) expect(effectiveCents[i] + trades[i]).toBe(finals[i]);
  // 禁止卖出的资产不得产生负向最终操作
  if (policies) {
    for (let i = 0; i < 4; i++) {
      if (policies[i] === "forbid") expect(trades[i]).toBeGreaterThanOrEqual(0);
    }
  }
  // 强制目标模式：最终金额须在 目标±取整单位 内（v1.0.1 对强制目标的真实定义）
  if (force && targetsCents && quantumCents !== null) {
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(finals[i] - targetsCents[i])).toBeLessThanOrEqual(quantumCents);
    }
  }
  // 所有金额保持整数分精度（解析自两位小数 CNY 文本，天然保证）
  for (const v of [...trades, ...finals]) expect(Number.isSafeInteger(v)).toBe(true);
}

export const wanToCents = wan => Math.round(wan * 10000) * 100;
