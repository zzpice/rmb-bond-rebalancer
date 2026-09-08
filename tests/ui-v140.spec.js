// v1.4.0 只升级工作台呈现层；核心计算段由源码哈希和现有 golden / regression 用例共同锁定。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];
const CORE_SHA256 = "502c6d5b560f5544544c93e5b99a37e820187859804522467c1a3682878ce1cc";

test("v1.4.0 核心计算源码与 main 基线实质一致且不受行尾格式影响", () => {
  const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  const core = html.match(/\/\/ All holdings[\s\S]*?(?=const SUMMARY_IDS=)/)?.[0];
  expect(core).toBeTruthy();
  const normalizeLineEndings = source => source.replace(/\r\n?/g, "\n");
  const hash = source => createHash("sha256").update(normalizeLineEndings(source)).digest("hex");
  expect(hash(core)).toBe(CORE_SHA256);
  expect(hash(normalizeLineEndings(core).replace(/\n/g, "\r\n"))).toBe(CORE_SHA256);
});

test.describe("v1.4.0 单页工作台导航", () => {
  test("桌面滚动后 toolbar 与 sidebar 真实粘住，导航 active 同步", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/");
    const sidebar = page.locator(".desktop-sidebar");
    const toolbar = page.locator(".workspace-toolbar");
    await expect(sidebar).toBeVisible();
    await expect(page.locator(".mobile-tabs")).toBeHidden();
    expect((await sidebar.boundingBox()).width).toBeLessThanOrEqual(220);
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2);

    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      toolbarTop: document.querySelector(".workspace-toolbar").getBoundingClientRect().top,
      sidebarTop: document.querySelector(".desktop-sidebar").getBoundingClientRect().top
    }));
    await page.evaluate(() => window.scrollTo({ top: document.getElementById("cashFlowSection").offsetTop - 40, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    await expect(sidebar.locator('[data-nav-key="cash"]')).toHaveAttribute("aria-current", "step");
    const after = await page.evaluate(() => ({
      toolbarTop: document.querySelector(".workspace-toolbar").getBoundingClientRect().top,
      sidebarTop: document.querySelector(".desktop-sidebar").getBoundingClientRect().top,
      sidebarBottom: document.querySelector(".desktop-sidebar").getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight
    }));
    expect(before.scrollY).toBeLessThanOrEqual(2);
    expect(Math.abs(after.toolbarTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.sidebarTop - before.sidebarTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.sidebarBottom - after.viewportHeight)).toBeLessThanOrEqual(1);
    await expect(toolbar).toBeVisible();

    const cash = sidebar.locator('[data-nav-key="cash"]');
    await cash.click();
    await expect(cash).toHaveAttribute("aria-current", "step");
    await expect(sidebar.locator('[data-nav-key="holdings"]')).not.toHaveAttribute("aria-current", "step");

    await page.evaluate(() => document.getElementById("resultsCard").scrollIntoView({ behavior: "instant", block: "start" }));
    await expect(sidebar.locator('[data-nav-key="results"]')).toHaveAttribute("aria-current", "step");
  });

  test("移动滚动后 tabs 真实粘在 toolbar 下方，点击与滚动 active 同步", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const tabs = page.locator(".mobile-tabs");
    await expect(tabs).toBeVisible();
    await expect(page.locator(".desktop-sidebar")).toBeHidden();
    await expect(tabs.locator(".workspace-nav-item")).toHaveCount(3);
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2);

    await page.evaluate(() => window.scrollTo({ top: document.getElementById("cashFlowSection").offsetTop - 40, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    await expect(tabs.locator('[data-nav-key="cash"]')).toHaveAttribute("aria-current", "step");
    const stickyGeometry = await page.evaluate(() => {
      const toolbar = document.querySelector(".workspace-toolbar").getBoundingClientRect();
      const tabs = document.querySelector(".mobile-tabs").getBoundingClientRect();
      return { toolbarTop: toolbar.top, toolbarBottom: toolbar.bottom, tabsTop: tabs.top, tabsBottom: tabs.bottom };
    });
    expect(Math.abs(stickyGeometry.toolbarTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.tabsTop - stickyGeometry.toolbarBottom)).toBeLessThanOrEqual(1);
    expect(stickyGeometry.tabsBottom).toBeLessThan(140);

    const cashTab = tabs.locator('[data-nav-key="cash"]');
    await cashTab.click();
    await expect(cashTab).toHaveAttribute("aria-current", "step");
    await expect.poll(async () => page.locator("#cashFlowSection").evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(100);
    await expect.poll(async () => page.locator("#cashFlowSection").evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(170);
    const geometry = await page.evaluate(() => ({
      sectionTop: document.getElementById("cashFlowSection").getBoundingClientRect().top,
      tabsBottom: document.querySelector(".mobile-tabs").getBoundingClientRect().bottom
    }));
    expect(geometry.sectionTop + 1).toBeGreaterThanOrEqual(geometry.tabsBottom);
  });

  test("桌面和移动端未生成建议时都只展示单一空态", async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator("#emptyResults")).toBeVisible();
      await expect(page.locator("#resultsCard .execution-summary")).toBeHidden();
      await expect(page.locator("#resultsCard .block-execution")).toBeHidden();
      await expect(page.locator("#resultsCard .block-comparison")).toBeHidden();
    }
  });
});

test.describe("v1.4.0 结果层级与中文表达", () => {
  test("核心结论显著高于次级数字，执行摘要 pill 使用已有操作数据", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);

    await expect(page.locator("#verdictKpi")).toHaveClass(/needs-action/);
    await expect(page.locator("#quickDecision")).toHaveText("需要操作");
    const sizes = await page.evaluate(() => ({
      verdict: parseFloat(getComputedStyle(document.getElementById("quickDecision")).fontSize),
      secondary: parseFloat(getComputedStyle(document.getElementById("quickTotal")).fontSize)
    }));
    expect(sizes.verdict).toBeGreaterThan(sizes.secondary);
    const tradeCount = await page.locator("#resultBody .trade-cell:not(.hold)").count();
    await expect(page.locator("#actionPills .action-pill")).toHaveCount(tradeCount);
  });

  test("区间图保留完整语义并使用自然中文标签", async ({ page }) => {
    await page.goto("/");
    const labels = page.locator("#fundBody .fund-card").first().locator(".band-values");
    await expect(labels).toContainText("目标比例");
    await expect(labels).toContainText("免调区间");
    await expect(labels).toContainText("回调位置");
    await expect(labels).not.toContainText("outer band");
    await expect(labels).not.toContainText("inner band");
    await expect(page.locator("#fundBody .band-track").first()).toHaveAttribute("aria-label", /目标.*免调范围.*回调位置/);
  });

  test("360–430px 核心结论保持单行且不缩小", async ({ page }) => {
    for (const scenario of [
      { holdings: [40, 44, 8, 4], expected: "需要操作" },
      { holdings: AT_TARGET, expected: "无需操作" }
    ]) {
      await page.setViewportSize({ width: 430, height: 900 });
      await page.goto("/");
      await fillPortfolio(page, { holdings: scenario.holdings, flow: 0 });
      await generate(page);
      for (const width of [360, 375, 390, 412, 430]) {
        await page.setViewportSize({ width, height: 900 });
        const verdict = await page.locator("#quickDecision").evaluate(element => {
          const range = document.createRange();range.selectNodeContents(element);
          const lineTops = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
          const style = getComputedStyle(element);
          return { lines: lineTops.size, fontSize: parseFloat(style.fontSize), right: element.getBoundingClientRect().right, viewport: window.innerWidth };
        });
        expect(verdict.lines, `${scenario.expected} at ${width}px`).toBe(1);
        expect(verdict.fontSize, `${width}px verdict font size`).toBeGreaterThanOrEqual(29);
        expect(verdict.right, `${width}px verdict right edge`).toBeLessThanOrEqual(verdict.viewport + .5);
        expect(await page.locator("#quickDecision").textContent()).toBe(scenario.expected);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
    }
  });
});

test.describe("v1.4.0 外观偏好", () => {
  test("可在跟随系统、浅色和深色间切换并只保存 UI 偏好", async ({ page }) => {
    await page.goto("/");
    await page.locator("#themeMode").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#themeColor")).toHaveAttribute("content", "#0d111a");
    await page.locator(".amount").first().fill("48");
    await page.reload();
    await expect(page.locator("#themeMode")).toHaveValue("dark");
    await expect(page.locator(".amount").first()).toHaveValue("");

    await page.locator("#themeMode").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#themeColor")).toHaveAttribute("content", "#f4f6fa");
  });

  test("跟随系统模式继续响应系统深色设置", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.locator("#themeMode").selectOption("system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await expect(page.locator("#themeColor")).toHaveAttribute("content", "#0d111a");
    const background = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).toBe("rgb(13, 17, 26)");
  });
});

test("v1.4.0 指定断点的导航、KPI、区间图均无页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  await fillPortfolio(page, { holdings: AT_TARGET, flow: 3.33 });
  await generate(page);

  for (const width of [360, 375, 390, 412, 430, 639, 640, 641, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const inside = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return box.left >= -.5 && box.right <= window.innerWidth + .5;
      };
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        toolbarInside: inside(".workspace-toolbar"),
        bandInside: inside("#fundBody .band-track"),
        verdictInside: inside("#verdictKpi"),
        mobileTabsVisible: getComputedStyle(document.querySelector(".mobile-tabs")).display !== "none",
        sidebarVisible: getComputedStyle(document.querySelector(".desktop-sidebar")).display !== "none"
      };
    });
    expect(layout.documentWidth, `${width}px document`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.bodyWidth, `${width}px body`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.toolbarInside, `${width}px toolbar`).toBe(true);
    expect(layout.bandInside, `${width}px band`).toBe(true);
    expect(layout.verdictInside, `${width}px verdict`).toBe(true);
    expect(layout.mobileTabsVisible, `${width}px mobile tabs`).toBe(width < 960);
    expect(layout.sidebarVisible, `${width}px desktop sidebar`).toBe(width >= 960);
  }
});
