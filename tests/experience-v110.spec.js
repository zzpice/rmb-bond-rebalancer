import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, parseMoney } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("v1.1.0 输入反馈", () => {
  test("完整输入后即时显示当前比例、目标偏离和越界方向", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [30, 38, 18, 10] });

    const first = page.locator("#fundBody .fund-card").nth(0);
    await expect(first.locator(".curw")).toHaveText("31.25%");
    await expect(first.locator(".target-label")).toHaveText("目标 50.00%");
    await expect(first.locator(".live-deviation")).toHaveText("低配 18.75 个百分点");
    await expect(first.locator(".state")).toHaveText("低配越界");

    const last = page.locator("#fundBody .fund-card").nth(3);
    await expect(last.locator(".curw")).toHaveText("10.42%");
    await expect(last.locator(".live-deviation")).toContainText("高配 6.25");
    await expect(last.locator(".state")).toHaveText("高配越界");
  });

  test("输入不完整时不展示可能误导的比例和偏离", async ({ page }) => {
    await page.goto("/");
    await page.locator(".amount").nth(0).fill("48");
    await expect(page.locator(".curw")).toHaveText(["—", "—", "—", "—"]);
    await expect(page.locator(".live-deviation")).toHaveText(["—", "—", "—", "—"]);
    await expect(page.locator("#fundBody .state")).toHaveText(["待填写", "待填写", "待填写", "待填写"]);
  });
});

test.describe("v1.1.0 结果说明", () => {
  test("显示调整前、目标和调整后比例，调整前包含在途交易", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, pending: [0, 0, 2, 0], flow: 0 });
    await generate(page);

    const rows = page.locator("#comparisonBody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(2).locator("td").nth(1)).toHaveText("14.2857%");
    await expect(rows.nth(2).locator("td").nth(2)).toHaveText("12.5000%");
    await expect(rows.nth(2).locator("td").nth(3)).toHaveText("14.2857%");
  });

  test("无交易时逐只说明位于免调整范围内", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);

    await expect(page.locator("#summaryHeadline")).toHaveText("无需买卖，外部资金与内部转换均为零。");
    await expect(page.locator("#resultBody .reason-cell")).toHaveText([
      "当前位于免调整范围内，无需操作。",
      "当前位于免调整范围内，无需操作。",
      "当前位于免调整范围内，无需操作。",
      "当前位于免调整范围内，无需操作。"
    ]);
  });

  for (const scenario of [
    { name: "资金流入", flow: 1, expected: "新增 CNY 10,000.00" },
    { name: "资金流出", flow: -1, expected: "取出 CNY 10,000.00" }
  ]) {
    test(`执行摘要明确区分${scenario.name}且无内部转换`, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, { holdings: AT_TARGET, flow: scenario.flow });
      await generate(page);

      await expect(page.locator("#quickFlow")).toHaveText(scenario.expected);
      await expect(page.locator("#quickTurnover")).toHaveText("CNY 0.00");
      await expect(page.locator("#summaryHeadline")).toContainText("无内部转换");
    });
  }

  test("内部再平衡仅展示可靠汇总金额，原因来自资金分配和内部转换结果", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);

    await expect(page.locator("#quickFlow")).toHaveText("无");
    expect(parseMoney(await page.locator("#quickTurnover").textContent())).toBeGreaterThan(0);
    await expect(page.locator("#summaryHeadline")).toContainText("内部转换");
    await expect(page.locator("#resultBody .reason-cell").nth(0)).toContainText("参与内部转换买入");
    await expect(page.locator("#resultBody .reason-cell").nth(1)).toContainText("参与内部转换卖出");
    await expect(page.locator("#summaryHeadline")).not.toContainText("→");
  });
});

test.describe("v1.1.0 执行操作", () => {
  test("一键复制包含资金、逐只操作和比例对比", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async text => { window.__copiedPlan = text; } }
      });
    });
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 1 });
    await generate(page);

    await expect(page.locator("#copyPlan")).toBeEnabled();
    await page.locator("#copyPlan").click();
    await expect(page.locator("#copyStatus")).toHaveText("已复制到剪贴板");
    const copied = await page.evaluate(() => window.__copiedPlan);
    expect(copied).toContain("债基再平衡执行方案");
    expect(copied).toContain("外部资金：新增 CNY 10,000.00");
    expect(copied).toContain("内部转换：CNY 0.00");
    expect(copied).toContain("002065 景顺长城景盛双息收益债券A类：");
    expect(copied).toContain("比例对比（调整前 / 目标 / 调整后）");
  });

  test("Clipboard API 拒绝后尝试降级复制，并在降级失败时提供已选中的完整方案", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new Error("permission denied"); } }
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: command => {
          window.__fallbackCommand = command;
          window.__fallbackText = document.activeElement?.value;
          return false;
        }
      });
    });
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 1 });
    await generate(page);
    await page.locator("#copyPlan").click();

    expect(await page.evaluate(() => window.__fallbackCommand)).toBe("copy");
    expect(await page.evaluate(() => window.__fallbackText)).toContain("债基再平衡执行方案");
    const manual = page.locator("#manualCopy");
    await expect(manual).toBeVisible();
    await expect(manual).toHaveValue(/外部资金：新增 CNY 10,000\.00/);
    const selection = await manual.evaluate(field => ({ start: field.selectionStart, end: field.selectionEnd, length: field.value.length }));
    expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length });
    await expect(page.locator("#copyStatus")).toHaveText("自动复制失败，请复制下方内容");
  });

  test("输入变化后旧方案不可继续复制", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#copyPlan")).toBeEnabled();
    await page.locator(".amount").nth(0).fill("49");
    await expect(page.locator("#copyPlan")).toBeDisabled();
  });

  test("清空本次输入和恢复默认参数互不混淆", async ({ page }) => {
    page.on("dialog", dialog => dialog.accept());
    await page.goto("/");
    await fillPortfolio(page, {
      holdings: AT_TARGET,
      flow: 2,
      pending: [1, 0, 0, 0],
      policies: ["avoid", null, null, null],
      settings: { absoluteBandPP: 2 }
    });

    await page.locator("#clear").click();
    expect(await page.locator(".amount").evaluateAll(fields => fields.map(field => field.value))).toEqual(["", "", "", ""]);
    expect(await page.locator(".pending").evaluateAll(fields => fields.map(field => field.value))).toEqual(["0", "0", "0", "0"]);
    expect(await page.locator(".sell-policy").evaluateAll(fields => fields.map(field => field.value))).toEqual(["normal", "normal", "normal", "normal"]);
    await expect(page.locator("#cashFlow")).toHaveValue("0");
    await expect(page.locator("#absoluteBandPP")).toHaveValue("2");

    await page.locator(".amount").nth(0).fill("20");
    await page.locator("#restoreDefaults").click();
    await expect(page.locator("#absoluteBandPP")).toHaveValue("5");
    await expect(page.locator("#relativeBandPct")).toHaveValue("25");
    await expect(page.locator(".amount").nth(0)).toHaveValue("20");
  });
});

test.describe("v1.1.0 PWA 安装体验", () => {
  test("安装提示取消后隐藏失效按钮，直到浏览器重新触发安装事件", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => { window.__installPrompted = true; };
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(page.locator("#installApp")).toBeVisible();
    await expect(page.locator("#installApp")).toHaveText("安装应用");
    await page.locator("#installApp").click();
    expect(await page.evaluate(() => window.__installPrompted)).toBe(true);
    await expect(page.locator("#installApp")).toBeHidden();

    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });
    await expect(page.locator("#installApp")).toBeVisible();
    await expect(page.locator("#installApp")).toHaveText("安装应用");
  });

  test("iOS 显示添加到主屏幕指引", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    });
    await page.goto("/");
    await expect(page.locator("#installApp")).toBeVisible();
    await expect(page.locator("#installApp")).toHaveText("添加到桌面");
    await page.locator("#installApp").click();
    await expect(page.locator("#installGuide")).toBeVisible();
    await expect(page.locator("#installGuide")).toContainText("分享");
    await expect(page.locator("#installGuide")).toContainText("添加到主屏幕");
  });

  test("已安装状态隐藏安装入口", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => query === "(display-mode: standalone)"
        ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }
        : original(query);
    });
    await page.goto("/");
    await expect(page.locator("#installApp")).toBeHidden();
    await expect(page.locator("#installSeparator")).toBeHidden();
  });
});

test("手机端结果卡片不造成整页横向滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
  await generate(page);

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator("#comparisonBody tr").first()).toBeVisible();
  await expect(page.locator("#resultBody .reason-cell").first()).toBeVisible();
  expect((await page.locator("#copyPlan").boundingBox()).height).toBeGreaterThanOrEqual(44);
});
