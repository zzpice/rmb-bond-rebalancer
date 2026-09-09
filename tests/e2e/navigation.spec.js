import { test, expect } from "@playwright/test";

test("桌面侧栏在工作台、方案和规则三个独立视图间切换", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const workspace = page.locator('[data-view-panel="workspace"]');
  const plan = page.locator('[data-view-panel="plan"]');
  const rules = page.locator('[data-view-panel="rules"]');
  const active = page.locator(".side-nav .nav-button.is-active");

  await expect(workspace).toBeVisible();
  await expect(plan).toBeHidden();
  await expect(rules).toBeHidden();
  await expect(page.locator("#appBarTitle")).toHaveText("组合工作台");

  await page.getByRole("button", { name: "执行方案", exact: true }).click();
  await expect(workspace).toBeHidden();
  await expect(plan).toBeVisible();
  await expect(rules).toBeHidden();
  await expect(active).toContainText("执行方案");
  await expect(page.locator("#appBarTitle")).toHaveText("执行方案");

  await page.getByRole("button", { name: "再平衡规则", exact: true }).click();
  await expect(plan).toBeHidden();
  await expect(rules).toBeVisible();
  await expect(active).toContainText("再平衡规则");
  await expect(page.locator("#appBarTitle")).toHaveText("再平衡规则");
});

test("移动端 tab 切换独立视图并恢复各自滚动位置", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const mobileNav = page.getByRole("navigation", { name: "移动端导航" });
  await page.evaluate(() => window.scrollTo(0, 600));
  const workspaceScroll = await page.evaluate(() => window.scrollY);
  expect(workspaceScroll).toBeGreaterThan(100);

  await mobileNav.getByRole("button", { name: "方案", exact: true }).click();
  await expect(page.locator('[data-view-panel="plan"]')).toBeVisible();
  await expect(mobileNav.locator(".mobile-tab.is-active")).toHaveText("方案");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await mobileNav.getByRole("button", { name: "规则", exact: true }).click();
  await expect(page.locator('[data-view-panel="rules"]')).toBeVisible();
  await expect(mobileNav.locator(".mobile-tab.is-active")).toHaveText("规则");

  await mobileNav.getByRole("button", { name: "工作台", exact: true }).click();
  await expect(page.locator('[data-view-panel="workspace"]')).toBeVisible();
  await expect(mobileNav.locator(".mobile-tab.is-active")).toHaveText("工作台");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(workspaceScroll);
});
