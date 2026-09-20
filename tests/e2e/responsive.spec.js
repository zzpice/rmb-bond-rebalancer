import { test, expect } from "@playwright/test";

async function fillHoldings(page, values) {
  for (let index = 0; index < values.length; index += 1) {
    await page.locator(`#holding-${index}`).fill(String(values[index]));
  }
}

async function expectNoInternalHorizontalScroll(locator) {
  const dimensions = await locator.evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

for (const viewport of [
  { name: "320px 手机", width: 320, height: 760 },
  { name: "768px 平板", width: 768, height: 900 },
  { name: "1181px 紧凑桌面", width: 1181, height: 900 },
  { name: "1440px 桌面", width: 1440, height: 1000 }
]) {
  test(`${viewport.name} 无页面级横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await fillHoldings(page, ["42", "26", "8", "20"]);
    await page.locator("#cashFlowInput").fill("-10");

    if (viewport.width <= 700) {
      await expectNoInternalHorizontalScroll(page.locator('[data-view-panel="workspace"] .table-scroll'));
      const inputFontSize = await page.locator("#holding-0").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(inputFontSize).toBeGreaterThanOrEqual(16);
      await expect(page.locator(".table-input").first()).toHaveCSS("min-height", "44px");
      await expect(page.locator(".mobile-bar .icon-button").first()).toHaveCSS("height", "44px");
      await expect(page.locator("#bulkToggle")).toHaveCSS("white-space", "nowrap");
    }

    await page.getByRole("button", { name: "生成再平衡方案" }).click();

    if (viewport.width <= 700) {
      await expectNoInternalHorizontalScroll(page.locator(".execution-card .table-scroll"));
    }

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("桌面显示固定侧栏，移动端显示顶部任务导航并支持纯黑深色主题", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeColor")).toHaveAttribute("content", "#000000");
  await expect(page.locator("[data-theme-toggle]").first()).toHaveAttribute("aria-label", "切换到浅色外观");
  await expect(page.locator(".side-nav")).toBeVisible();
  await expect(page.locator(".mobile-bar")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".side-nav")).toBeHidden();
  await expect(page.locator(".mobile-bar")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "移动端导航" })).toBeVisible();

  const darkBackground = await page.locator("html").evaluate(element => getComputedStyle(element).getPropertyValue("--bg").trim());
  expect(darkBackground).toBe("#000000");

  await page.locator(".mobile-bar [data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".mobile-bar [data-theme-toggle]")).toHaveAttribute("aria-label", "切换到深色外观");
});
