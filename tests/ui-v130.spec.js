// v1.3.0 只验证呈现层：区间数据取自真实 bounds()，执行结果仍由现有核心返回。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, parseMoney } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("v1.3.0 再平衡区间", () => {
  test("四只基金均展示目标、outer band、inner band 与待填写状态", async ({ page }) => {
    await page.goto("/");
    const bands = page.locator("#fundBody .band-visual");
    await expect(bands).toHaveCount(4);
    await expect(bands.locator(".band-status")).toHaveText(["待填写", "待填写", "待填写", "待填写"]);
    for (let i = 0; i < 4; i++) {
      await expect(bands.nth(i).locator(".band-target-value")).toHaveText(/%$/);
      await expect(bands.nth(i).locator(".band-outer-value")).toContainText("～");
      await expect(bands.nth(i).locator(".band-inner-value")).toContainText("／");
      await expect(bands.nth(i).locator(".band-track")).toHaveAttribute("aria-label", /免调范围.*越界后回调位置/);
    }
  });

  test("不同当前比例正确显示正常范围、低配和高配", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [54, 32, 6, 4] });
    await expect(page.locator("#fundBody .band-status")).toHaveText(["高配", "正常范围", "低配", "正常范围"]);
    expect(await page.locator("#fundBody .band-visual").evaluateAll(bands => bands.map(band => band.dataset.bandState))).toEqual(["over", "ok", "under", "ok"]);
    await expect(page.locator("#fundBody .band-explanation").nth(0)).toContainText("回调至");
    await expect(page.locator("#fundBody .band-explanation").nth(0)).toContainText("而非目标");
    await expect(page.locator("#fundBody .band-explanation").nth(2)).toContainText("回调至");
  });

  test("outer 与 inner 数值直接等于当前设置下 bounds() 的结果", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, {
      holdings: [40, 44, 8, 4],
      settings: { absoluteBandPP: 2, relativeBandPct: 10, landingPct: 80 }
    });
    const comparison = await page.evaluate(() => {
      const amounts = [40, 44, 8, 4].map(window.toCents);
      const total = amounts.reduce((sum, value) => sum + value, 0);
      const expectedBounds = window.bounds(total);
      const expectedTargets = window.targetCents(total);
      return [...document.querySelectorAll("#fundBody .band-visual")].map((band, i) => ({
        actual: {
          low: Number(band.dataset.outerLowCents),
          high: Number(band.dataset.outerHighCents),
          innerLow: Number(band.dataset.innerLowCents),
          innerHigh: Number(band.dataset.innerHighCents),
          target: Number(band.dataset.targetCents),
          current: Number(band.dataset.currentCents)
        },
        expected: { ...expectedBounds[i], target: expectedTargets[i], current: amounts[i] }
      }));
    });
    for (const item of comparison) expect(item.actual).toEqual(item.expected);
  });

  test("偏离目标但仍在 outer band 内时明确说明不调整", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [51.84, 30.72, 9.6, 3.84], flow: 0 });
    await expect(page.locator("#fundBody .band-status")).toHaveText(["正常范围", "正常范围", "正常范围", "正常范围"]);
    await expect(page.locator("#fundBody .band-explanation")).toHaveText([
      "当前位于免调范围内，不调整。",
      "当前位于免调范围内，不调整。",
      "当前位于免调范围内，不调整。",
      "当前位于免调范围内，不调整。"
    ]);
    await generate(page);
    await expect(page.locator("#quickDecision")).toHaveText("无需操作");
  });
});

test.describe("v1.3.0 结果摘要与资金配平", () => {
  test("无需再平衡时顶部摘要按总资产、结论、偏离、笔数展示", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#quickTotal")).toHaveText("CNY 960,000.00");
    await expect(page.locator("#quickDecision")).toHaveText("无需操作");
    await expect(page.locator("#quickDeviation")).toHaveText("0.00 pp");
    await expect(page.locator("#quickCount")).toHaveText("0 笔");
  });

  test("需要再平衡时顶部摘要显示最大偏离与真实操作笔数", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    await expect(page.locator("#quickDecision")).toHaveText("需要操作");
    await expect(page.locator("#quickDeviation")).toHaveText("12.50 pp");
    await expect(page.locator("#quickDeviationMeta")).toHaveText("110017 高配");
    const trades = page.locator("#resultBody .trade-cell:not(.hold)");
    await expect(page.locator("#quickCount")).toHaveText(`${await trades.count()} 笔`);
  });

  test("买入合计减卖出合计严格等于外部资金流", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 10 });
    await generate(page);
    const summary = page.locator(".balance-summary");
    const cents = await summary.evaluate(element => ({
      buy: Number(element.dataset.buyCents),
      sell: Number(element.dataset.sellCents),
      flow: Number(element.dataset.flowCents)
    }));
    expect(cents.buy - cents.sell).toBe(cents.flow);
    expect(parseMoney(await page.locator("#balanceBuy").textContent())).toBe(cents.buy);
    expect(parseMoney(await page.locator("#balanceSell").textContent())).toBe(cents.sell);
    expect(parseMoney(await page.locator("#quickFlow").textContent())).toBe(Math.abs(cents.flow));
    await expect(page.locator("#balanceEquation")).toContainText("−");
    await expect(page.locator("#balanceEquation")).toContainText("=");
  });

  test("执行提示只按新增、卖出、小额与取整结果触发", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#execNote")).toBeHidden();

    await page.locator("#cashFlow").fill("1");
    await generate(page);
    await expect(page.locator("#execNote [data-note=inflow]")).toBeVisible();
    await expect(page.locator("#execNote [data-note=redemption]")).toHaveCount(0);

    await page.reload();
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 0 });
    await generate(page);
    await expect(page.locator("#execNote [data-note=redemption]")).toBeVisible();
    await expect(page.locator("#execNote [data-note=inflow]")).toHaveCount(0);

    await page.reload();
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0.49 });
    await generate(page);
    await expect(page.locator("#execNote [data-note=small-required]")).toBeVisible();

    await page.reload();
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 3.33 });
    await generate(page);
    await expect(page.locator("#execNote [data-note=small-merged]")).toBeVisible();
  });

  test("修改输入后新增摘要、配平数据和提示同步失效", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 10 });
    await generate(page);
    await expect(page.locator("#balanceBuy")).not.toHaveText("—");
    await page.locator(".amount").nth(0).fill("69");
    await expect(page.locator("#quickTotal")).toHaveText("—");
    await expect(page.locator("#quickDecision")).toHaveText("—");
    await expect(page.locator("#balanceBuy")).toHaveText("—");
    await expect(page.locator("#balanceEquation")).toHaveText("买入合计 − 卖出合计 = 外部资金流");
    await expect(page.locator("#execNote")).toBeHidden();
    await expect(page.locator(".balance-summary")).not.toHaveAttribute("data-flow-cents");
  });
});

test.describe("v1.3.0 数字排版与响应式", () => {
  test("动态金额、比例和结果数字使用 tabular-nums", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    for (const selector of [".amount", ".curw", ".band-visual", "#quickTotal", "#balanceEquation", "#resultBody td"]) {
      const value = await page.locator(selector).first().evaluate(element => getComputedStyle(element).fontVariantNumeric);
      expect(value).toContain("tabular-nums");
    }
  });

  test("手机端与 640px 断点附近无溢出、遮挡或裁切", async ({ page }) => {
    for (const width of [390, 639, 640, 641]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
      await generate(page);
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth
      }));
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewport);
      for (const band of await page.locator("#fundBody .band-track").all()) {
        const box = await band.boundingBox();
        expect(box).not.toBeNull();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + .5);
      }
      await expect(page.locator(".balance-summary")).toBeVisible();
      await expect(page.locator("#quickCount")).toBeVisible();
    }
  });
});
