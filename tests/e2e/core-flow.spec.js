import { test, expect } from "@playwright/test";

async function fillHoldings(page, values) {
  for (let index = 0; index < values.length; index += 1) {
    await page.locator(`#holding-${index}`).fill(String(values[index]));
  }
}

test("填写输入后生成完整 Dashboard 执行方案并切到方案页", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["42", "26", "8", "20"]);
  await page.locator("#cashFlowInput").fill("-10");
  await expect(page.locator("#currentTotal")).toHaveText("96 万");
  await expect(page.locator("#afterTotal")).toHaveText("86 万");

  await page.getByRole("button", { name: "生成再平衡方案" }).click();
  await expect(page.locator('[data-view-panel="plan"]')).toBeVisible();
  await expect(page.locator("#planContent")).toBeVisible();
  await expect(page.locator("#decisionTitle")).toContainText("内部转换");
  await expect(page.getByTestId("execution-row")).toHaveCount(4);
  await expect(page.locator("#calculationList")).toContainText("金额守恒");
  await expect(page.locator(".risk-note")).toContainText("未计入相关费用");
});

test("目标组合无资金变动时清楚说明无需操作", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["48", "31.9968", "12", "4.0032"]);
  await page.getByRole("button", { name: "生成再平衡方案" }).click();

  await expect(page.locator("#decisionTitle")).toHaveText("当前无需调整");
  await expect(page.locator(".action-pill", { hasText: "保持" })).toHaveCount(4);
  await expect(page.locator("#internalTurnover")).toHaveText("CNY 0");
});

test("新增资金方案只有买入且不产生基金间转换", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["48", "31.9968", "12", "4.0032"]);
  await page.locator("#cashFlowInput").fill("1");
  await page.getByRole("button", { name: "生成再平衡方案" }).click();

  await expect(page.locator("#decisionBadge")).toHaveText("仅资金流");
  await expect(page.locator("#internalTurnover")).toHaveText("CNY 0");
  await expect(page.locator(".action-pill.negative")).toHaveCount(0);
  await expect(page.locator(".action-pill.positive")).toHaveCount(4);
});

test("缺失或非法输入给出就地错误且不展示过期方案", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["48", "32", "12"]);
  await page.getByRole("button", { name: "生成再平衡方案" }).click();
  await expect(page.locator("#statusBanner")).toContainText("007194");
  await expect(page.locator("#holding-3")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-view-panel="workspace"]')).toBeVisible();
  await expect(page.locator("#planContent")).toBeHidden();

  await page.locator("#holding-3").fill("4");
  await page.locator("#cashFlowInput").fill("-100");
  await page.getByRole("button", { name: "生成再平衡方案" }).click();
  await expect(page.locator("#statusBanner")).toContainText("必须大于 0");
});
