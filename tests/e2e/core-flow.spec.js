import { test, expect } from "@playwright/test";

async function fillHoldings(page, values) {
  for (let index = 0; index < values.length; index += 1) {
    await page.locator(`#holding-${index}`).fill(String(values[index]));
  }
}

test("填写输入后生成完整 Dashboard 取现方案并切到方案页", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["60", "39.996", "15", "5.004"]);
  await page.locator("#cashFlowInput").fill("-8");
  await expect(page.locator("#currentTotal")).toHaveText("120 万");
  await expect(page.locator("#afterTotal")).toHaveText("112 万");

  await page.getByRole("button", { name: "生成再平衡方案" }).click();
  await expect(page.locator('[data-view-panel="plan"]')).toBeVisible();
  await expect(page.locator("#planContent")).toBeVisible();
  await expect(page.locator("#decisionTitle")).toHaveText("只需按方案取出资金");
  await expect(page.locator("#decisionText")).toContainText("如提款前存在高配越界");
  await expect(page.locator("#decisionText")).toContainText("取现后组合允许暂时偏离再平衡区间");
  await expect(page.getByTestId("execution-row")).toHaveCount(2);
  await expect(page.getByTestId("unchanged-item")).toHaveCount(2);
  await expect(page.locator(".action-pill.negative")).toHaveCount(2);
  await expect(page.locator("#internalTurnover")).toHaveText("CNY 0");
  await expect(page.locator("#calculationList")).toContainText("金额守恒");
  await expect(page.locator(".risk-note")).toContainText("未计入相关费用");
});

test("目标组合无资金变动时清楚说明无需操作", async ({ page }) => {
  await page.goto("/");
  await fillHoldings(page, ["48", "31.9968", "12", "4.0032"]);
  await page.getByRole("button", { name: "生成再平衡方案" }).click();

  await expect(page.locator("#decisionTitle")).toHaveText("当前无需调整");
  await expect(page.locator("#noTrades")).toBeVisible();
  await expect(page.locator("#activeTradesTable")).toBeHidden();
  await expect(page.getByTestId("unchanged-item")).toHaveCount(4);
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
  await expect(page.locator("#unchangedTrades")).toBeHidden();
});

test("双环配置图、批量填入与资金快捷按钮联动", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#currentRing")).not.toHaveClass(/is-ready/);
  await expect(page.locator("#targetRing")).toHaveAttribute("style", /conic-gradient/);

  await page.getByRole("button", { name: "批量填入" }).click();
  await page.locator("#bulkHoldingsInput").fill("50，33.33 / 12.5 4.17");
  await page.getByRole("button", { name: "应用", exact: true }).click();

  await expect(page.locator("#holding-0")).toHaveValue("50");
  await expect(page.locator("#holding-3")).toHaveValue("4.17");
  await expect(page.locator("#currentRing")).toHaveClass(/is-ready/);
  await expect(page.locator("#allocationChart")).toHaveAttribute("aria-label", /当前总额100 万/);
  await expect(page.locator('[data-allocation-current="0"]')).toHaveText("50.00%");
  await expect(page.locator("#statusBanner")).toContainText("已按基金顺序填入");

  await page.locator('[data-flow-value="5"]').click();
  await expect(page.locator("#cashFlowInput")).toHaveValue("5");
  await expect(page.locator('[data-flow-value="5"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#afterTotal")).toHaveText("105 万");

  await page.locator("#cashFlowInput").fill("+5.0000");
  await expect(page.locator('[data-flow-value="5"]')).toHaveAttribute("aria-pressed", "true");
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
