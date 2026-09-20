import {
  FUNDS,
  VERSION,
  buildBands,
  parseWanAmount,
  snapshot
} from "./portfolio.js";
import { createRebalancePlan } from "./rebalance.js";
import { formatCurrency, formatPercent, formatSignedPercent, formatWan } from "./format.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const THEME_KEY = "rmb-rebalancer-theme";
const FUND_COLORS = ["var(--fund-1)", "var(--fund-2)", "var(--fund-3)", "var(--fund-4)"];
const VIEW_TITLES = Object.freeze({
  workspace: "组合工作台",
  plan: "执行方案",
  rules: "再平衡规则"
});
const viewScroll = { workspace: 0, plan: 0, rules: 0 };

let activePlan = null;
let activeView = "workspace";
let copyResetTimer = null;

renderFunds();
renderAllocationBase();
renderBands();
bindEvents();
applyInitialTheme();
updateLiveState();
registerServiceWorker();

function renderFunds() {
  $("#holdingsBody").innerHTML = FUNDS.map((fund, index) => `
    <tr data-fund-row="${index}">
      <td>
        <a class="fund-name" href="${fund.url}" target="_blank" rel="noopener noreferrer" title="${fund.fullName}">
          <strong>${fund.name}</strong><span>${fund.code} · ${fund.category}</span>
        </a>
      </td>
      <td class="numeric mono">${formatPercent(fund.targetBps / 10_000)}</td>
      <td class="numeric">
        <label class="sr-only" for="holding-${index}">${fund.name}当前持仓（万 CNY）</label>
        <div class="table-input"><input id="holding-${index}" class="holding-input" data-index="${index}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0000" /><span>万</span></div>
      </td>
      <td class="numeric mono current-weight" data-weight="${index}">—</td>
      <td><span class="state-pill is-pending" data-state="${index}">待输入</span></td>
    </tr>
  `).join("");
}

function renderAllocationBase() {
  const targetWeights = FUNDS.map(fund => fund.targetBps / 10_000);
  $("#targetRing").style.setProperty("--ring-gradient", allocationGradient(targetWeights));
  $("#allocationLegend").innerHTML = FUNDS.map((fund, index) => `
    <div class="allocation-item" data-allocation-item="${index}">
      <i style="--fund-color:${FUND_COLORS[index]}"></i>
      <span><strong>${fund.code}</strong><small>${fund.name}</small></span>
      <span class="allocation-values"><b data-allocation-current="${index}">—</b><small>目标 ${formatPercent(targetWeights[index])}</small></span>
    </div>
  `).join("");
  resetAllocation();
}

function renderBands() {
  const total = 1_000_000;
  const bands = buildBands(total);
  $("#bandsList").innerHTML = FUNDS.map((fund, index) => {
    const band = bands[index];
    return `
      <div class="band-row">
        <div class="band-name"><strong>${fund.name}</strong><span>${fund.code}</span></div>
        <div class="band-track" aria-label="${fund.name}触发区间与 80% 回调区间">
          <span class="band-safe" style="left:${band.lowWeight * 100}%;width:${band.tolerance * 200}%"></span>
          <i style="left:${band.targetWeight * 100}%"></i>
        </div>
        <div class="band-values"><b>${formatPercent(band.targetWeight)}</b><span>触发 ${formatPercent(band.lowWeight)} – ${formatPercent(band.highWeight)} · 回调 ${formatPercent(band.reentryLowWeight)} – ${formatPercent(band.reentryHighWeight)}</span></div>
      </div>
    `;
  }).join("");
}

function bindEvents() {
  $$(".holding-input, #cashFlowInput").forEach(input => {
    input.addEventListener("input", () => {
      handleInputChange(input);
    });
  });

  $("#generateButton").addEventListener("click", generatePlan);
  $("#bulkToggle").addEventListener("click", toggleBulkPanel);
  $("#bulkApply").addEventListener("click", applyBulkHoldings);
  $("#bulkCancel").addEventListener("click", closeBulkPanel);
  $("#bulkHoldingsInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) applyBulkHoldings();
    if (event.key === "Escape") {
      event.preventDefault();
      closeBulkPanel();
    }
  });
  $$("[data-flow-value]").forEach(button => {
    button.addEventListener("click", () => setQuickFlow(button.dataset.flowValue));
  });
  $$("[data-clear-inputs]").forEach(button => button.addEventListener("click", clearInputs));
  $("#copyButton").addEventListener("click", copyPlan);
  $$("[data-refresh-version]").forEach(button => button.addEventListener("click", () => refreshVersion(button)));
  $$("[data-theme-toggle]").forEach(button => button.addEventListener("click", toggleTheme));
  $$("[data-view-nav]").forEach(button => button.addEventListener("click", () => setView(button.dataset.viewNav)));
}

function handleInputChange(input) {
  input.removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  updateQuickFlowState();
  updateLiveState();
}

function toggleBulkPanel() {
  const panel = $("#bulkPanel");
  const nextOpen = panel.hidden;
  if (!nextOpen) return closeBulkPanel();
  panel.hidden = false;
  $("#bulkToggle").setAttribute("aria-expanded", "true");
  $("#bulkHoldingsInput").focus();
  $("#bulkHoldingsInput").select();
}

function closeBulkPanel({ returnFocus = true } = {}) {
  $("#bulkPanel").hidden = true;
  $("#bulkToggle").setAttribute("aria-expanded", "false");
  $("#bulkHoldingsInput").removeAttribute("aria-invalid");
  if (returnFocus) $("#bulkToggle").focus();
}

function applyBulkHoldings() {
  const input = $("#bulkHoldingsInput");
  const values = input.value.trim().split(/[\s,，/、;；]+/).filter(Boolean);
  if (values.length !== FUNDS.length) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", `批量填入需要 ${FUNDS.length} 个金额，目前识别到 ${values.length} 个。`);
    return;
  }

  try {
    values.forEach((value, index) => parseWanAmount(value, { label: `${FUNDS[index].code} 当前持仓` }));
  } catch (error) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", error.message || "批量金额格式不正确。");
    return;
  }

  values.forEach((value, index) => {
    const holding = $(`#holding-${index}`);
    holding.value = value;
    holding.removeAttribute("aria-invalid");
  });
  input.removeAttribute("aria-invalid");
  closeBulkPanel({ returnFocus: false });
  invalidatePlan();
  updateLiveState();
  showBanner("success", "已按基金顺序填入 4 项持仓。");
  $("#cashFlowInput").focus();
}

function setQuickFlow(value) {
  const input = $("#cashFlowInput");
  input.value = value;
  handleInputChange(input);
}

function updateQuickFlowState() {
  const value = $("#cashFlowInput").value.trim();
  let amount = null;
  try {
    amount = parseWanAmount(value, { allowNegative: true });
  } catch {}
  $$("[data-flow-value]").forEach(button => {
    const quickAmount = Number(button.dataset.flowValue) * 10_000;
    button.setAttribute("aria-pressed", String(amount === quickAmount));
  });
}

function setView(view) {
  const panel = $(`[data-view-panel="${view}"]`);
  if (!panel || view === activeView) return;

  viewScroll[activeView] = window.scrollY;
  $$("[data-view-panel]").forEach(item => { item.hidden = item !== panel; });
  $$("[data-view-nav]").forEach(button => {
    const isActive = button.dataset.viewNav === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#appBarTitle").textContent = VIEW_TITLES[view];
  activeView = view;
  requestAnimationFrame(() => window.scrollTo(0, viewScroll[view]));
}

function readForm({ quiet = false } = {}) {
  const holdings = FUNDS.map((fund, index) => {
    const input = `#holding-${index}`;
    try {
      return parseWanAmount($(input).value, { label: `${fund.code} 当前持仓` });
    } catch (error) {
      error.field = input;
      if (!quiet) markInvalid(input);
      throw error;
    }
  });

  let flow;
  try {
    flow = parseWanAmount($("#cashFlowInput").value, {
      label: "资金变动",
      allowNegative: true
    });
  } catch (error) {
    error.field = "#cashFlowInput";
    if (!quiet) markInvalid(error.field);
    throw error;
  }
  return { holdings, flow };
}

function updateLiveState() {
  let values;
  try {
    values = readForm({ quiet: true });
  } catch {
    resetLiveState();
    return;
  }

  try {
    const current = snapshot(values.holdings);
    const after = current.total + values.flow;
    if (after <= 0) throw new Error();

    $("#currentTotal").textContent = formatWan(current.total);
    $("#afterTotal").textContent = formatWan(after);
    $("#flowSummary").textContent = flowLabel(values.flow);

    const largest = current.rows
      .map((row, index) => ({ ...row, index }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];
    $("#maxDeviation").textContent = formatSignedPercent(largest.deviation);
    $("#deviationFund").textContent = `${FUNDS[largest.index].code} 相对目标`;
    $("#portfolioStatus").textContent = current.breached ? "存在越界" : "区间内";
    $("#portfolioStatus").className = `kpi-value kpi-status ${current.breached ? "negative" : "positive"}`;
    $("#statusDetail").textContent = current.breached ? "本次计算将按资金变动类型处理" : "当前无需内部转换";

    updateAllocation(current);

    current.rows.forEach((row, index) => {
      $(`[data-weight="${index}"]`).textContent = formatPercent(row.weight);
      const state = $(`[data-state="${index}"]`);
      state.textContent = row.breached ? (row.deviation > 0 ? "高配越界" : "低配越界") : "区间内";
      state.className = `state-pill ${row.breached ? "is-breach" : "is-safe"}`;
    });
  } catch {
    resetLiveState();
  }
}

function resetLiveState() {
  $("#currentTotal").textContent = "—";
  $("#afterTotal").textContent = "—";
  $("#maxDeviation").textContent = "—";
  $("#flowSummary").textContent = "等待输入";
  $("#deviationFund").textContent = "相对目标比例";
  $("#portfolioStatus").textContent = "等待输入";
  $("#portfolioStatus").className = "kpi-value kpi-status";
  $("#statusDetail").textContent = "填写全部持仓后判断";
  resetAllocation();
  FUNDS.forEach((_, index) => {
    $(`[data-weight="${index}"]`).textContent = "—";
    const state = $(`[data-state="${index}"]`);
    state.textContent = "待输入";
    state.className = "state-pill is-pending";
  });
}

function updateAllocation(current) {
  const weights = current.rows.map(row => row.weight);
  $("#currentRing").style.setProperty("--ring-gradient", allocationGradient(weights));
  $("#currentRing").classList.add("is-ready");
  $("#chartTotal").textContent = formatWan(current.total);
  $("#chartState").textContent = current.breached ? "存在越界" : "全部在区间内";
  $("#chartState").className = current.breached ? "negative" : "positive";
  $("#allocationChart").setAttribute(
    "aria-label",
    `当前总额${formatWan(current.total)}，${current.breached ? "存在越界" : "全部在区间内"}。${FUNDS.map((fund, index) => `${fund.code} ${formatPercent(weights[index])}`).join("，")}`
  );

  current.rows.forEach((row, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = formatPercent(row.weight);
    const item = $(`[data-allocation-item="${index}"]`);
    item.dataset.tone = row.breached ? (row.deviation > 0 ? "high" : "low") : "safe";
  });
}

function resetAllocation() {
import {
  FUNDS,
  VERSION,
  buildBands,
  parseWanAmount,
  snapshot
} from "./portfolio.js";
import { createRebalancePlan } from "./rebalance.js";
import { formatCurrency, formatPercent, formatSignedPercent, formatWan } from "./format.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const THEME_KEY = "rmb-rebalancer-theme";
const FUND_COLORS = ["var(--fund-1)", "var(--fund-2)", "var(--fund-3)", "var(--fund-4)"];
const VIEW_TITLES = Object.freeze({
  workspace: "组合工作台",
  plan: "执行方案",
  rules: "再平衡规则"
});
const viewScroll = { workspace: 0, plan: 0, rules: 0 };

let activePlan = null;
let activeView = "workspace";
let copyResetTimer = null;

renderFunds();
renderAllocationBase();
renderBands();
bindEvents();
applyInitialTheme();
updateLiveState();
registerServiceWorker();

function renderFunds() {
  $("#holdingsBody").innerHTML = FUNDS.map((fund, index) => `
    <tr data-fund-row="${index}">
      <td>
        <a class="fund-name" href="${fund.url}" target="_blank" rel="noopener noreferrer" title="${fund.fullName}">
          <strong>${fund.name}</strong><span>${fund.code} · ${fund.category}</span>
        </a>
      </td>
      <td class="numeric mono">${formatPercent(fund.targetBps / 10_000)}</td>
      <td class="numeric">
        <label class="sr-only" for="holding-${index}">${fund.name}当前持仓（万 CNY）</label>
        <div class="table-input"><input id="holding-${index}" class="holding-input" data-index="${index}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0000" /><span>万</span></div>
      </td>
      <td class="numeric mono current-weight" data-weight="${index}">—</td>
      <td><span class="state-pill is-pending" data-state="${index}">待输入</span></td>
    </tr>
  `).join("");
}

function renderAllocationBase() {
  const targetWeights = FUNDS.map(fund => fund.targetBps / 10_000);
  $("#targetRing").style.setProperty("--ring-gradient", allocationGradient(targetWeights));
  $("#allocationLegend").innerHTML = FUNDS.map((fund, index) => `
    <div class="allocation-item" data-allocation-item="${index}">
      <i style="--fund-color:${FUND_COLORS[index]}"></i>
      <span><strong>${fund.code}</strong><small>${fund.name}</small></span>
      <span class="allocation-values"><b data-allocation-current="${index}">—</b><small>目标 ${formatPercent(targetWeights[index])}</small></span>
    </div>
  `).join("");
  resetAllocation();
}

function renderBands() {
  const total = 1_000_000;
  const bands = buildBands(total);
  $("#bandsList").innerHTML = FUNDS.map((fund, index) => {
    const band = bands[index];
    return `
      <div class="band-row">
        <div class="band-name"><strong>${fund.name}</strong><span>${fund.code}</span></div>
        <div class="band-track" aria-label="${fund.name}触发区间与 80% 回调区间">
          <span class="band-safe" style="left:${band.lowWeight * 100}%;width:${band.tolerance * 200}%"></span>
          <i style="left:${band.targetWeight * 100}%"></i>
        </div>
        <div class="band-values"><b>${formatPercent(band.targetWeight)}</b><span>触发 ${formatPercent(band.lowWeight)} – ${formatPercent(band.highWeight)} · 回调 ${formatPercent(band.reentryLowWeight)} – ${formatPercent(band.reentryHighWeight)}</span></div>
      </div>
    `;
  }).join("");
}

function bindEvents() {
  $$(".holding-input, #cashFlowInput").forEach(input => {
    input.addEventListener("input", () => {
      handleInputChange(input);
    });
  });

  $("#generateButton").addEventListener("click", generatePlan);
  $("#bulkToggle").addEventListener("click", toggleBulkPanel);
  $("#bulkApply").addEventListener("click", applyBulkHoldings);
  $("#bulkCancel").addEventListener("click", closeBulkPanel);
  $("#bulkHoldingsInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) applyBulkHoldings();
    if (event.key === "Escape") {
      event.preventDefault();
      closeBulkPanel();
    }
  });
  $$("[data-flow-value]").forEach(button => {
    button.addEventListener("click", () => setQuickFlow(button.dataset.flowValue));
  });
  $$("[data-clear-inputs]").forEach(button => button.addEventListener("click", clearInputs));
  $("#copyButton").addEventListener("click", copyPlan);
  $$("[data-refresh-version]").forEach(button => button.addEventListener("click", () => refreshVersion(button)));
  $$("[data-theme-toggle]").forEach(button => button.addEventListener("click", toggleTheme));
  $$("[data-view-nav]").forEach(button => button.addEventListener("click", () => setView(button.dataset.viewNav)));
}

function handleInputChange(input) {
  input.removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  updateQuickFlowState();
  updateLiveState();
}

function toggleBulkPanel() {
  const panel = $("#bulkPanel");
  const nextOpen = panel.hidden;
  if (!nextOpen) return closeBulkPanel();
  panel.hidden = false;
  $("#bulkToggle").setAttribute("aria-expanded", "true");
  $("#bulkHoldingsInput").focus();
  $("#bulkHoldingsInput").select();
}

function closeBulkPanel({ returnFocus = true } = {}) {
  $("#bulkPanel").hidden = true;
  $("#bulkToggle").setAttribute("aria-expanded", "false");
  $("#bulkHoldingsInput").removeAttribute("aria-invalid");
  if (returnFocus) $("#bulkToggle").focus();
}

function applyBulkHoldings() {
  const input = $("#bulkHoldingsInput");
  const values = input.value.trim().split(/[\s,，/、;；]+/).filter(Boolean);
  if (values.length !== FUNDS.length) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", `批量填入需要 ${FUNDS.length} 个金额，目前识别到 ${values.length} 个。`);
    return;
  }

  try {
    values.forEach((value, index) => parseWanAmount(value, { label: `${FUNDS[index].code} 当前持仓` }));
  } catch (error) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", error.message || "批量金额格式不正确。");
    return;
  }

  values.forEach((value, index) => {
    const holding = $(`#holding-${index}`);
    holding.value = value;
    holding.removeAttribute("aria-invalid");
  });
  input.removeAttribute("aria-invalid");
  closeBulkPanel({ returnFocus: false });
  invalidatePlan();
  updateLiveState();
  showBanner("success", "已按基金顺序填入 4 项持仓。");
  $("#cashFlowInput").focus();
}

function setQuickFlow(value) {
  const input = $("#cashFlowInput");
  input.value = value;
  handleInputChange(input);
}

function updateQuickFlowState() {
  const value = $("#cashFlowInput").value.trim();
  let amount = null;
  try {
    amount = parseWanAmount(value, { allowNegative: true });
  } catch {}
  $$("[data-flow-value]").forEach(button => {
    const quickAmount = Number(button.dataset.flowValue) * 10_000;
    button.setAttribute("aria-pressed", String(amount === quickAmount));
  });
}

function setView(view) {
  const panel = $(`[data-view-panel="${view}"]`);
  if (!panel || view === activeView) return;

  viewScroll[activeView] = window.scrollY;
  $$("[data-view-panel]").forEach(item => { item.hidden = item !== panel; });
  $$("[data-view-nav]").forEach(button => {
    const isActive = button.dataset.viewNav === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#appBarTitle").textContent = VIEW_TITLES[view];
  activeView = view;
  requestAnimationFrame(() => window.scrollTo(0, viewScroll[view]));
}

function readForm({ quiet = false } = {}) {
  const holdings = FUNDS.map((fund, index) => {
    const input = `#holding-${index}`;
    try {
      return parseWanAmount($(input).value, { label: `${fund.code} 当前持仓` });
    } catch (error) {
      error.field = input;
      if (!quiet) markInvalid(input);
      throw error;
    }
  });

  let flow;
  try {
    flow = parseWanAmount($("#cashFlowInput").value, {
      label: "资金变动",
      allowNegative: true
    });
  } catch (error) {
    error.field = "#cashFlowInput";
    if (!quiet) markInvalid(error.field);
    throw error;
  }
  return { holdings, flow };
}

function updateLiveState() {
  let values;
  try {
    values = readForm({ quiet: true });
  } catch {
    resetLiveState();
    return;
  }

  try {
    const current = snapshot(values.holdings);
    const after = current.total + values.flow;
    if (after <= 0) throw new Error();

    $("#currentTotal").textContent = formatWan(current.total);
    $("#afterTotal").textContent = formatWan(after);
    $("#flowSummary").textContent = flowLabel(values.flow);

    const largest = current.rows
      .map((row, index) => ({ ...row, index }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];
    $("#maxDeviation").textContent = formatSignedPercent(largest.deviation);
    $("#deviationFund").textContent = `${FUNDS[largest.index].code} 相对目标`;
    $("#portfolioStatus").textContent = current.breached ? "存在越界" : "区间内";
    $("#portfolioStatus").className = `kpi-value kpi-status ${current.breached ? "negative" : "positive"}`;
    $("#statusDetail").textContent = current.breached ? "本次计算将按资金变动类型处理" : "当前无需内部转换";

    updateAllocation(current);

    current.rows.forEach((row, index) => {
      $(`[data-weight="${index}"]`).textContent = formatPercent(row.weight);
      const state = $(`[data-state="${index}"]`);
      state.textContent = row.breached ? (row.deviation > 0 ? "高配越界" : "低配越界") : "区间内";
      state.className = `state-pill ${row.breached ? "is-breach" : "is-safe"}`;
    });
  } catch {
    resetLiveState();
  }
}

function resetLiveState() {
  $("#currentTotal").textContent = "—";
  $("#afterTotal").textContent = "—";
  $("#maxDeviation").textContent = "—";
  $("#flowSummary").textContent = "等待输入";
  $("#deviationFund").textContent = "相对目标比例";
  $("#portfolioStatus").textContent = "等待输入";
  $("#portfolioStatus").className = "kpi-value kpi-status";
  $("#statusDetail").textContent = "填写全部持仓后判断";
  resetAllocation();
  FUNDS.forEach((_, index) => {
    $(`[data-weight="${index}"]`).textContent = "—";
    const state = $(`[data-state="${index}"]`);
    state.textContent = "待输入";
    state.className = "state-pill is-pending";
  });
}

function updateAllocation(current) {
  const weights = current.rows.map(row => row.weight);
  $("#currentRing").style.setProperty("--ring-gradient", allocationGradient(weights));
  $("#currentRing").classList.add("is-ready");
  $("#chartTotal").textContent = formatWan(current.total);
  $("#chartState").textContent = current.breached ? "存在越界" : "全部在区间内";
  $("#chartState").className = current.breached ? "negative" : "positive";
  $("#allocationChart").setAttribute(
    "aria-label",
    `当前总额${formatWan(current.total)}，${current.breached ? "存在越界" : "全部在区间内"}。${FUNDS.map((fund, index) => `${fund.code} ${formatPercent(weights[index])}`).join("，")}`
  );

  current.rows.forEach((row, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = formatPercent(row.weight);
    const item = $(`[data-allocation-item="${index}"]`);
    item.dataset.tone = row.breached ? (row.deviation > 0 ? "high" : "low") : "safe";
  });
}

function resetAllocation() {
  const ring = $("#currentRing");
  if (!ring) return;
  ring.style.setProperty("--ring-gradient", "conic-gradient(var(--surface-mid) 0 100%)");
  ring.classList.remove("is-ready");
  $("#chartTotal").textContent = "—";
  $("#chartState").textContent = "等待输入";
  $("#chartState").className = "";
  $("#allocationChart").setAttribute("aria-label", "等待输入当前持仓");
  FUNDS.forEach((_, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = "—";
    delete $(`[data-allocation-item="${index}"]`).dataset.tone;
  });
}

function allocationGradient(weights) {
  let cursor = 0;
  const stops = weights.map((weight, index) => {
    const start = cursor;
    cursor += weight * 100;
    return `${FUND_COLORS[index]} ${start.toFixed(4)}% ${cursor.toFixed(4)}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

function generatePlan() {
  try {
    const input = readForm();
    const plan = createRebalancePlan(input);
    activePlan = plan;
    renderPlan(plan);
    hideBanner();
    viewScroll.plan = 0;
    setView("plan");
  } catch (error) {
    activePlan = null;
    showBanner("error", error.message || "无法生成方案，请检查输入。");
    if (error.field) {
      markInvalid(error.field);
      $(error.field)?.focus();
    }
  }
}

function renderPlan(plan) {
  $("#planEmpty").hidden = true;
  $("#planContent").hidden = false;
  $("#copyButton").disabled = false;

  const decision = decisionCopy(plan);
  $("#decisionTitle").textContent = decision.title;
  $("#decisionText").textContent = decision.text;
  $("#decisionBadge").textContent = decision.badge;
  $("#decisionCard").dataset.mode = plan.mode;
  $("#buyTotal").textContent = formatCurrency(plan.buyTotal);
  $("#sellTotal").textContent = formatCurrency(plan.sellTotal);
  $("#internalTurnover").textContent = formatCurrency(plan.internalTurnover);
  $("#finalDeviation").textContent = formatPercent(Math.abs(maxAbs(plan.deviations)));
  $("#tradeCount").textContent = `${plan.tradeCount} 笔操作`;

  const activeIndexes = plan.trades.map((trade, index) => trade ? index : null).filter(index => index !== null);
  const unchangedIndexes = plan.trades.map((trade, index) => trade ? null : index).filter(index => index !== null);
  $("#executionBody").innerHTML = activeIndexes.map(index => renderTradeRow(plan, index)).join("");
  $("#activeTradesTable").hidden = activeIndexes.length === 0;
  $("#noTrades").hidden = activeIndexes.length !== 0;
  $("#unchangedTrades").hidden = unchangedIndexes.length === 0;
  $("#unchangedTrades").open = false;
  $("#unchangedSummary").textContent = activeIndexes.length
    ? `另外 ${unchangedIndexes.length} 只基金无需操作`
    : `${unchangedIndexes.length} 只基金均无需操作`;
  $("#unchangedList").innerHTML = unchangedIndexes.map(index => `
    <div class="unchanged-item" data-testid="unchanged-item">
      <span><i style="--fund-color:${FUND_COLORS[index]}"></i><b>${FUNDS[index].code}</b>${FUNDS[index].name}</span>
      <span>${formatCurrency(plan.final[index])} · ${formatPercent(plan.weights[index])}</span>
    </div>
  `).join("");

  $("#comparisonList").innerHTML = FUNDS.map((fund, index) => {
    const before = plan.holdings[index] / plan.currentTotal;
    const after = plan.weights[index];
    const target = fund.targetBps / 10_000;
    return `
      <div class="comparison-row">
        <div class="comparison-head"><strong>${fund.name}</strong><span>目标 ${formatPercent(target)}</span></div>
        <div class="compare-line"><span>调整前</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="before-bar" style="width:${Math.min(100, before * 100)}%"></b></div><em>${formatPercent(before)}</em></div>
        <div class="compare-line"><span>调整后</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="after-bar" style="width:${Math.min(100, after * 100)}%"></b></div><em>${formatPercent(after)}</em></div>
      </div>
    `;
  }).join("");

  const breachNames = plan.breaches
    .map((breached, index) => breached ? FUNDS[index].code : null)
    .filter(Boolean);
  $("#calculationList").innerHTML = `
    <div><dt>当前总额</dt><dd>${formatCurrency(plan.currentTotal)}</dd></div>
    <div><dt>外部资金流</dt><dd>${formatCurrency(plan.flow, { signed: true })}</dd></div>
    <div><dt>资金流后触发</dt><dd>${breachNames.length ? breachNames.join("、") : "无"}</dd></div>
    <div><dt>基金间转换</dt><dd>${formatCurrency(plan.internalTurnover)}</dd></div>
    <div><dt>最终总额</dt><dd>${formatCurrency(plan.finalTotal)}</dd></div>
    <div><dt>金额守恒</dt><dd>买入 − 卖出 = ${formatCurrency(plan.flow, { signed: true })}</dd></div>
  `;
}

function renderTradeRow(plan, index) {
  const fund = FUNDS[index];
  const trade = plan.trades[index];
  const action = trade > 0 ? "买入" : "卖出";
  const tone = trade > 0 ? "positive" : "negative";
  return `
    <tr data-testid="execution-row" data-tone="${tone}">
      <td><span class="fund-name result-fund"><strong>${fund.name}</strong><span>${fund.code}</span></span></td>
      <td><span class="action-pill ${tone}"><i aria-hidden="true">${trade > 0 ? "↗" : "↘"}</i>${action}</span></td>
      <td class="numeric mono ${tone}" data-testid="trade-amount">${formatCurrency(Math.abs(trade))}</td>
      <td class="numeric mono">${formatCurrency(plan.final[index])}</td>
      <td class="numeric mono">${formatPercent(plan.weights[index])}</td>
      <td class="reason-cell">${tradeReason(plan, index)}</td>
    </tr>
  `;
}

function decisionCopy(plan) {
  if (plan.mode === "internal") {
    const codes = plan.breaches.map((value, index) => value ? FUNDS[index].code : null).filter(Boolean);
    return {
      title: "执行资金变动，并完成一次内部转换",
      text: `${codes.join("、")} 在资金流分配后严格越过 5 / 25 外层触发区间。方案将全部基金带回 80% 回调区间，并在金额守恒下保持最小内部换手。`,
      badge: "需要转换"
    };
  }
  if (plan.mode === "flow") {
    return plan.flow > 0 ? {
      title: "只需分配本次新增资金",
      text: "新增资金按各基金相对目标的缺口比例分配；资金流后未越过 5 / 25 外层，因此不安排基金间转换。",
      badge: "仅资金流"
    } : {
      title: "只需按方案取出资金",
      text: "如提款前存在高配越界，优先利用本次取现纠偏；其余金额依次从短债、纯债和固收增强中取出。本次不追加基金间转换，取现后组合允许暂时偏离再平衡区间。",
      badge: "仅资金流"
    };
  }
  return {
    title: "当前无需调整",
    text: "4 只基金均未越过各自 5 / 25 外层触发区间。80% 回调区间只在触发后使用，本次不产生基金间转换。",
    badge: "保持"
  };
}

function tradeReason(plan, index) {
  const flowPart = plan.flowTrades[index];
  const internalPart = plan.internalTrades[index];
  if (flowPart && internalPart) return "资金流纠偏 + 回调区间调整";
  if (internalPart) return plan.breaches[index] ? "进入 80% 回调区间" : "回调区间配平";
  if (flowPart) return plan.flow > 0 ? "按目标缺口分配新增资金" : "按取现顺序分配";
  return "无需操作";
}

function clearInputs() {
  $$(".holding-input").forEach(input => {
    input.value = "";
    input.removeAttribute("aria-invalid");
  });
  $("#cashFlowInput").value = "0";
  $("#cashFlowInput").removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  closeBulkPanel({ returnFocus: false });
  $("#bulkHoldingsInput").value = "";
  updateQuickFlowState();
  updateLiveState();
  $("#holding-0").focus();
}

function invalidatePlan() {
  activePlan = null;
  $("#planContent").hidden = true;
  $("#planEmpty").hidden = false;
  $("#copyButton").disabled = true;
  $("#copyButton").textContent = "复制方案";
  $("#manualCopy").hidden = true;
}

async function copyPlan() {
  if (!activePlan) return;
  const text = buildCopyText(activePlan);
  try {
    await navigator.clipboard.writeText(text);
    showCopyFeedback("已复制");
  } catch {
    const area = $("#manualCopy");
    area.value = text;
    area.hidden = false;
    area.select();
    const copied = document.execCommand?.("copy");
    if (copied) area.hidden = true;
    else {
      area.focus();
      area.select();
    }
    showCopyFeedback(copied ? "已复制" : "请手动复制");
  }
}

function buildCopyText(plan) {
  const lines = [
    `债基再平衡方案 v${VERSION}`,
    `当前总额：${formatCurrency(plan.currentTotal)}`,
    `资金变动：${formatCurrency(plan.flow, { signed: true })}`,
    ""
  ];
  const activeTrades = plan.trades.map((trade, index) => ({ trade, index })).filter(item => item.trade);
  if (!activeTrades.length) lines.push("本次无需操作");
  activeTrades.forEach(({ trade, index }) => {
    const action = trade > 0 ? `买入 ${formatCurrency(trade)}` : `卖出 ${formatCurrency(-trade)}`;
    lines.push(`${FUNDS[index].code} ${FUNDS[index].name}：${action}`);
  });
  const unchangedCount = FUNDS.length - activeTrades.length;
  if (activeTrades.length && unchangedCount) lines.push(`其余 ${unchangedCount} 只基金保持不变`);
  lines.push("", `基金间转换：${formatCurrency(plan.internalTurnover)}`);
  lines.push("执行金额仅供参考，未计入相关费用及确认期间的净值变化。");
  return lines.join("\n");
}

function showCopyFeedback(text) {
  clearTimeout(copyResetTimer);
  $("#copyButton").textContent = text;
  copyResetTimer = setTimeout(() => { $("#copyButton").textContent = "复制方案"; }, 1600);
}

function showBanner(type, message) {
  const banner = $("#statusBanner");
  banner.className = `status-banner is-${type}`;
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner() {
  $("#statusBanner").hidden = true;
}

function markInvalid(selector) {
  $(selector)?.setAttribute("aria-invalid", "true");
}

function flowLabel(flow) {
  if (flow > 0) return `新增 ${formatWan(flow)}`;
  if (flow < 0) return `取出 ${formatWan(-flow)}`;
  return "无外部资金变动";
}

function maxAbs(values) {
  return values.reduce((largest, value) => Math.abs(value) > Math.abs(largest) ? value : largest, 0);
}

function applyInitialTheme() {
  let theme = "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") theme = stored;
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch {}
  applyTheme(theme);
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeColor").content = theme === "dark" ? "#000000" : "#f5f7fb";
  $$("[data-theme-toggle]").forEach(button => {
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {});
    });
  }
}

async function refreshVersion(button) {
  button.disabled = true;
  const label = button.querySelector("span:last-child");
  if (label) label.textContent = "正在刷新";
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("./")
        || await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      await registration.update();
      const waiting = registration.waiting;
      if (waiting) {
        const reload = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        waiting.postMessage({ type: "SKIP_WAITING" });
        await Promise.race([reload, new Promise(resolve => setTimeout(resolve, 1800))]);
      }
    }
  } finally {
    window.location.reload();
  }
}
  const ring = $("#currentRing");
  if (!ring) return;
  ring.style.setProperty("--ring-gradient", "conic-gradient(var(--surface-mid) 0 100%)");
  ring.classList.remove("is-ready");
  $("#chartTotal").textContent = "—";
  $("#chartState").textContent = "等待输入";
  $("#chartState").className = "";
  $("#allocationChart").setAttribute("aria-label", "等待输入当前持仓");
  FUNDS.forEach((_, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = "—";
    delete $(`[data-allocation-item="${index}"]`).dataset.tone;
  });
}

function allocationGradient(weights) {
  let cursor = 0;
  const stops = weights.map((weight, index) => {
    const start = cursor;
    cursor += weight * 100;
    return `${FUND_COLORS[index]} ${start.toFixed(4)}% ${cursor.toFixed(4)}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

function generatePlan() {
  try {
    const input = readForm();
    const plan = createRebalancePlan(input);
    activePlan = plan;
    renderPlan(plan);
    hideBanner();
    viewScroll.plan = 0;
    setView("plan");
  } catch (error) {
    activePlan = null;
    showBanner("error", error.message || "无法生成方案，请检查输入。");
    if (error.field) {
      markInvalid(error.field);
      $(error.field)?.focus();
    }
  }
}

function renderPlan(plan) {
  $("#planEmpty").hidden = true;
  $("#planContent").hidden = false;
  $("#copyButton").disabled = false;

  const decision = decisionCopy(plan);
  $("#decisionTitle").textContent = decision.title;
  $("#decisionText").textContent = decision.text;
  $("#decisionBadge").textContent = decision.badge;
  $("#decisionCard").dataset.mode = plan.mode;
  $("#buyTotal").textContent = formatCurrency(plan.buyTotal);
  $("#sellTotal").textContent = formatCurrency(plan.sellTotal);
  $("#internalTurnover").textContent = formatCurrency(plan.internalTurnover);
  $("#finalDeviation").textContent = formatPercent(Math.abs(maxAbs(plan.deviations)));
  $("#tradeCount").textContent = `${plan.tradeCount} 笔操作`;

  const activeIndexes = plan.trades.map((trade, index) => trade ? index : null).filter(index => index !== null);
  const unchangedIndexes = plan.trades.map((trade, index) => trade ? null : index).filter(index => index !== null);
  $("#executionBody").innerHTML = activeIndexes.map(index => renderTradeRow(plan, index)).join("");
  $("#activeTradesTable").hidden = activeIndexes.length === 0;
  $("#noTrades").hidden = activeIndexes.length !== 0;
  $("#unchangedTrades").hidden = unchangedIndexes.length === 0;
  $("#unchangedTrades").open = false;
  $("#unchangedSummary").textContent = activeIndexes.length
    ? `另外 ${unchangedIndexes.length} 只基金无需操作`
    : `${unchangedIndexes.length} 只基金均无需操作`;
  $("#unchangedList").innerHTML = unchangedIndexes.map(index => `
    <div class="unchanged-item" data-testid="unchanged-item">
      <span><i style="--fund-color:${FUND_COLORS[index]}"></i><b>${FUNDS[index].code}</b>${FUNDS[index].name}</span>
      <span>${formatCurrency(plan.final[index])} · ${formatPercent(plan.weights[index])}</span>
    </div>
  `).join("");

  $("#comparisonList").innerHTML = FUNDS.map((fund, index) => {
    const before = plan.holdings[index] / plan.currentTotal;
    const after = plan.weights[index];
    const target = fund.targetBps / 10_000;
    return `
      <div class="comparison-row">
        <div class="comparison-head"><strong>${fund.name}</strong><span>目标 ${formatPercent(target)}</span></div>
        <div class="compare-line"><span>调整前</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="before-bar" style="width:${Math.min(100, before * 100)}%"></b></div><em>${formatPercent(before)}</em></div>
        <div class="compare-line"><span>调整后</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="after-bar" style="width:${Math.min(100, after * 100)}%"></b></div><em>${formatPercent(after)}</em></div>
      </div>
    `;
  }).join("");

  const breachNames = plan.breaches
    .map((breached, index) => breached ? FUNDS[index].code : null)
    .filter(Boolean);
  $("#calculationList").innerHTML = `
    <div><dt>当前总额</dt><dd>${formatCurrency(plan.currentTotal)}</dd></div>
    <div><dt>外部资金流</dt><dd>${formatCurrency(plan.flow, { signed: true })}</dd></div>
    <div><dt>资金流后触发</dt><dd>${breachNames.length ? breachNames.join("、") : "无"}</dd></div>
    <div><dt>基金间转换</dt><dd>${formatCurrency(plan.internalTurnover)}</dd></div>
    <div><dt>最终总额</dt><dd>${formatCurrency(plan.finalTotal)}</dd></div>
    <div><dt>金额守恒</dt><dd>买入 − 卖出 = ${formatCurrency(plan.flow, { signed: true })}</dd></div>
  `;
}

function renderTradeRow(plan, index) {
  const fund = FUNDS[index];
  const trade = plan.trades[index];
  const action = trade > 0 ? "买入" : "卖出";
  const tone = trade > 0 ? "positive" : "negative";
  return `
    <tr data-testid="execution-row" data-tone="${tone}">
      <td><span class="fund-name result-fund"><strong>${fund.name}</strong><span>${fund.code}</span></span></td>
      <td><span class="action-pill ${tone}"><i aria-hidden="true">${trade > 0 ? "↗" : "↘"}</i>${action}</span></td>
      <td class="numeric mono ${tone}" data-testid="trade-amount">${formatCurrency(Math.abs(trade))}</td>
      <td class="numeric mono">${formatCurrency(plan.final[index])}</td>
      <td class="numeric mono">${formatPercent(plan.weights[index])}</td>
      <td class="reason-cell">${tradeReason(plan, index)}</td>
    </tr>
  `;
}

function decisionCopy(plan) {
  if (plan.mode === "internal") {
    const codes = plan.breaches.map((value, index) => value ? FUNDS[index].code : null).filter(Boolean);
    return {
      title: "执行资金变动，并完成一次内部转换",
      text: `${codes.join("、")} 在资金流分配后严格越过 5 / 25 外层触发区间。方案将全部基金带回 80% 回调区间，并在金额守恒下保持最小内部换手。`,
      badge: "需要转换"
    };
  }
  if (plan.mode === "flow") {
    return plan.flow > 0 ? {
      title: "只需分配本次新增资金",
      text: "新增资金按各基金相对目标的缺口比例分配；资金流后未越过 5 / 25 外层，因此不安排基金间转换。",
      badge: "仅资金流"
    } : {
      title: "只需按方案取出资金",
      text: "如提款前存在高配越界，优先利用本次取现纠偏；其余金额依次从短债、纯债和固收增强中取出。本次不追加基金间转换，取现后组合允许暂时偏离再平衡区间。",
      badge: "仅资金流"
    };
  }
  return {
    title: "当前无需调整",
    text: "4 只基金均未越过各自 5 / 25 外层触发区间。80% 回调区间只在触发后使用，本次不产生基金间转换。",
    badge: "保持"
  };
}

function tradeReason(plan, index) {
  const flowPart = plan.flowTrades[index];
  const internalPart = plan.internalTrades[index];
  if (flowPart && internalPart) return "资金流纠偏 + 回调区间调整";
  if (internalPart) return plan.breaches[index] ? "进入 80% 回调区间" : "回调区间配平";
  if (flowPart) return plan.flow > 0 ? "按目标缺口分配新增资金" : "按取现顺序分配";
  return "无需操作";
}

function clearInputs() {
  $$(".holding-input").forEach(input => {
    input.value = "";
    input.removeAttribute("aria-invalid");
  });
  $("#cashFlowInput").value = "0";
  $("#cashFlowInput").removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  closeBulkPanel({ returnFocus: false });
  $("#bulkHoldingsInput").value = "";
  updateQuickFlowState();
  updateLiveState();
  $("#holding-0").focus();
}

function invalidatePlan() {
  activePlan = null;
  $("#planContent").hidden = true;
  $("#planEmpty").hidden = false;
  $("#copyButton").disabled = true;
  $("#copyButton").textContent = "复制方案";
  $("#manualCopy").hidden = true;
}

async function copyPlan() {
  if (!activePlan) return;
  const text = buildCopyText(activePlan);
  try {
    await navigator.clipboard.writeText(text);
    showCopyFeedback("已复制");
  } catch {
    const area = $("#manualCopy");
    area.value = text;
    area.hidden = false;
    area.select();
    const copied = document.execCommand?.("copy");
    if (copied) area.hidden = true;
    else {
      area.focus();
      area.select();
    }
    showCopyFeedback(copied ? "已复制" : "请手动复制");
  }
}

function buildCopyText(plan) {
  const lines = [
    `债基再平衡方案 v${VERSION}`,
    `当前总额：${formatCurrency(plan.currentTotal)}`,
    `资金变动：${formatCurrency(plan.flow, { signed: true })}`,
    ""
  ];
  const activeTrades = plan.trades.map((trade, index) => ({ trade, index })).filter(item => item.trade);
  if (!activeTrades.length) lines.push("本次无需操作");
  activeTrades.forEach(({ trade, index }) => {
    const action = trade > 0 ? `买入 ${formatCurrency(trade)}` : `卖出 ${formatCurrency(-trade)}`;
    lines.push(`${FUNDS[index].code} ${FUNDS[index].name}：${action}`);
  });
  const unchangedCount = FUNDS.length - activeTrades.length;
  if (activeTrades.length && unchangedCount) lines.push(`其余 ${unchangedCount} 只基金保持不变`);
  lines.push("", `基金间转换：${formatCurrency(plan.internalTurnover)}`);
  lines.push("执行金额仅供参考，未计入相关费用及确认期间的净值变化。");
  return lines.join("\n");
}

function showCopyFeedback(text) {
  clearTimeout(copyResetTimer);
  $("#copyButton").textContent = text;
  copyResetTimer = setTimeout(() => { $("#copyButton").textContent = "复制方案"; }, 1600);
}

function showBanner(type, message) {
  const banner = $("#statusBanner");
  banner.className = `status-banner is-${type}`;
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner() {
  $("#statusBanner").hidden = true;
}

function markInvalid(selector) {
  $(selector)?.setAttribute("aria-invalid", "true");
}

function flowLabel(flow) {
  if (flow > 0) return `新增 ${formatWan(flow)}`;
  if (flow < 0) return `取出 ${formatWan(-flow)}`;
  return "无外部资金变动";
}

function maxAbs(values) {
  return values.reduce((largest, value) => Math.abs(value) > Math.abs(largest) ? value : largest, 0);
}

function applyInitialTheme() {
  let theme = "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") theme = stored;
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch {}
  applyTheme(theme);
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeColor").content = theme === "dark" ? "#000000" : "#f5f7fb";
  $$("[data-theme-toggle]").forEach(button => {
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {});
    });
  }
}

async function refreshVersion(button) {
  button.disabled = true;
  const label = button.querySelector("span:last-child");
  if (label) label.textContent = "正在刷新";
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("./")
        || await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      await registration.update();
      const waiting = registration.waiting;
      if (waiting) {
        const reload = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        waiting.postMessage({ type: "SKIP_WAITING" });
        await Promise.race([reload, new Promise(resolve => setTimeout(resolve, 1800))]);
      }
    }
  } finally {
    window.location.reload();
  }
}
