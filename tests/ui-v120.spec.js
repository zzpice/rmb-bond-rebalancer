// 类别：v1.2.0 UI 层级与阅读效率回归。仅验证 UI 层，不触碰算法 baseline。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("v1.2.0 操作层级", () => {
  test("生成建议是唯一主操作，按目标比例调整是次级操作并带说明", async ({ page }) => {
    await page.goto("/");
    const check = page.locator("#check");
    const force = page.locator("#force");
    await expect(check).toHaveClass(/primary/);
    await expect(force).not.toHaveClass(/primary/);
    await expect(page.locator(".force-hint")).toHaveText("忽略免调范围，直接回到目标附近");
  });

  test("按目标比例调整仅生成方案，不需要确认弹窗", async ({ page }) => {
    await page.goto("/");
    let dialogFired = false;
    page.on("dialog", dialog => { dialogFired = true; dialog.dismiss(); });
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await page.locator("#force").click();
    expect(dialogFired).toBe(false);
    await expect(page.locator("#status .status-verdict")).toHaveText("已按目标比例调整");
  });

  test("清空输入为低权重次级按钮，不再使用红色危险样式", async ({ page }) => {
    await page.goto("/");
    const clear = page.locator("#clear");
    await expect(clear).toHaveClass(/quiet-action/);
    await expect(clear).not.toHaveClass(/text-danger/);
    const color = await clear.evaluate(el => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(215, 0, 21)");
    await expect(clear).toHaveText("清空");
  });
});

test.describe("v1.2.0 结果结论与摘要合并", () => {
  test("处于目标比例时结论框显示「无需调整」并附免调范围说明", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    const box = page.locator("#status .statusbox");
    await expect(box).toHaveClass(/ok/);
    await expect(box.locator(".status-verdict")).toHaveText("无需调整");
    await expect(box.locator(".status-detail")).toContainText("免调范围内");
  });

  test("越界时结论框显示「需要调整」并说明免调范围", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    const box = page.locator("#status .statusbox");
    await expect(box).toHaveClass(/warn/);
    await expect(box.locator(".status-verdict")).toHaveText("需要调整");
    await expect(box.locator(".status-detail")).toContainText("基金越界");
  });

  test("输入变化后结论与状态框重置", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#status .statusbox")).toHaveCount(1);
    await page.locator(".amount").nth(0).fill("49");
    await expect(page.locator("#status .statusbox")).toHaveCount(0);
  });

  test("结果区顶部为单一结论框 + 执行摘要，无重复状态框与仓位摘要", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    await expect(page.locator("#conclusion")).toHaveCount(0);
    await expect(page.locator("#roleSummary")).toHaveCount(0);
    await expect(page.locator("#status .statusbox")).toHaveCount(1);
    await expect(page.locator("#summaryHeadline")).toBeHidden();
  });
});

test.describe("v1.2.0 百分比与说明", () => {
  test("比例对比与执行清单的百分比均为 2 位小数", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 10 });
    await generate(page);
    const comparison = page.locator("#comparisonBody .before-weight, #comparisonBody .target-weight, #comparisonBody .after-weight");
    for (let i = 0; i < await comparison.count(); i++) {
      await expect(comparison.nth(i)).toHaveText(/^\d{1,3}\.\d{2}%$/);
    }
    const resultWeights = page.locator("#resultBody td[data-label='调整后占比']");
    for (let i = 0; i < await resultWeights.count(); i++) {
      await expect(resultWeights.nth(i)).toHaveText(/^\d{1,3}\.\d{2}%$/);
    }
  });

  test("高级设置默认折叠，摘要补充参数用途说明", async ({ page }) => {
    await page.goto("/");
    const summary = page.locator("details.card > summary", { hasText: "高级设置" });
    await expect(summary).toContainText("高级设置");
    await expect(page.locator("details.card", { hasText: "高级设置" })).not.toHaveAttribute("open", "");
  });

  test("footer 以低权重方式展示版本信息", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer.footer")).toContainText("v1.5.0");
  });
});

test.describe("v1.2.0 手机端操作栏", () => {
  test("四项持仓填写完成前操作栏不固定悬浮，填写完成后固定", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const dock = page.locator(".action-dock");
    const dockPosition = () => dock.evaluate(el => getComputedStyle(el).position);
    const isDockReady = () => page.locator("body").evaluate(el => el.classList.contains("dock-ready"));

    expect(await dockPosition()).not.toBe("fixed");
    expect(await isDockReady()).toBe(false);

    await page.locator(".amount").nth(0).fill("40");
    await page.locator(".amount").nth(1).fill("44");
    expect(await dockPosition()).not.toBe("fixed");
    expect(await isDockReady()).toBe(false);

    await page.locator(".amount").nth(2).fill("8");
    await page.locator(".amount").nth(3).fill("4");
    expect(await isDockReady()).toBe(true);
    expect(await dockPosition()).toBe("fixed");
  });
});

test.describe("v1.2.0 手机端结果区排序", () => {
  test("手机端按 执行摘要→执行清单→比例对比→计算说明 排序", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    const order = await page.evaluate(() => {
      const card = document.getElementById("resultsCard");
      const top = sel => card.querySelector(sel).getBoundingClientRect().top;
      return {
        summary: top(".execution-summary"),
        execution: top(".block-execution"),
        comparison: top(".block-comparison"),
        details: top(".result-details")
      };
    });
    expect(order.summary).toBeLessThan(order.execution);
    expect(order.execution).toBeLessThan(order.comparison);
    expect(order.comparison).toBeLessThan(order.details);
  });

  test("桌面端也按 执行清单→比例对比 排序", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    const order = await page.evaluate(() => {
      const card = document.getElementById("resultsCard");
      const top = sel => card.querySelector(sel).getBoundingClientRect().top;
      return { comparison: top(".block-comparison"), execution: top(".block-execution") };
    });
    expect(order.execution).toBeLessThan(order.comparison);
  });
});

test.describe("v1.2.0 手机端密度", () => {
  test("手机端基金卡保持可读且不造成横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });

    const cards = page.locator("#fundBody .fund-card");
    for (let i = 0; i < 4; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".curw")).toHaveText(/%$/);
      await expect(card.locator(".target-label")).toContainText("目标");
      await expect(card.locator(".live-deviation")).toContainText("个百分点");
    }
    const dims = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth
    }));
    expect(dims.documentWidth).toBeLessThanOrEqual(dims.viewport);
  });
});

test.describe("v1.2.0 手机端 sticky 说明收口", () => {
  test("手机端操作栏只保留两个按钮，不展示辅助说明", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hint = page.locator(".action-dock .force-hint");
    await expect(hint).toBeHidden();
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await expect(hint).toBeHidden();
    await expect(page.locator(".action-dock #check")).toBeVisible();
    await expect(page.locator(".action-dock #force")).toBeVisible();
  });
});

test.describe("v1.2.0 手机端未生成空状态", () => {
  test("未生成建议时仅显示统一空状态提示，隐藏多个占位区块", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const empty = page.locator("#emptyResults");
    await expect(empty).toBeVisible();
    await expect(empty).toHaveText("填写持仓后生成建议");
    await expect(page.locator("#resultsCard .execution-summary")).toBeHidden();
    await expect(page.locator("#resultsCard .block-comparison")).toBeHidden();
    await expect(page.locator("#resultsCard .block-execution")).toBeHidden();
  });

  test("生成建议后展示完整区块并隐藏空状态提示", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [40, 44, 8, 4], flow: 0 });
    await generate(page);
    await expect(page.locator("#emptyResults")).toBeHidden();
    await expect(page.locator("#resultsCard .execution-summary")).toBeVisible();
    await expect(page.locator("#resultsCard .block-comparison")).toBeVisible();
    await expect(page.locator("#resultsCard .block-execution")).toBeVisible();
  });

  test("输入不完整时显示错误状态而非空状态提示", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".amount").nth(0).fill("40");
    await generate(page);
    await expect(page.locator("#status .statusbox")).toBeVisible();
    await expect(page.locator("#emptyResults")).toBeHidden();
  });

  test("桌面端未生成时也只显示统一空状态", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/");
    await expect(page.locator("#resultsCard .execution-summary")).toBeHidden();
    await expect(page.locator("#resultsCard .block-comparison")).toBeHidden();
    await expect(page.locator("#resultsCard .block-execution")).toBeHidden();
    await expect(page.locator("#emptyResults")).toBeVisible();
  });
});
