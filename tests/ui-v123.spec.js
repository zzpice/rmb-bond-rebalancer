import { test, expect } from "@playwright/test";

test.describe("v1.2.3 maintenance polish", () => {
  test("页面包含基础分享与规范链接元数据", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /人民币债券基金再平衡/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "债基再平衡助手 · CNY");
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /尽量减少换手/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://zzpice.github.io/rmb-bond-rebalancer/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://zzpice.github.io/rmb-bond-rebalancer/");
  });

  test("次级调整操作与安装提示提供明确的无障碍语义", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#force")).toHaveAttribute("aria-describedby", "forceHint");
    await expect(page.locator("#forceHint")).toHaveText("忽略免调范围，直接回到目标附近");
    await expect(page.locator("#installGuide")).toHaveAttribute("role", "status");
    await expect(page.locator("#installGuide")).toHaveAttribute("aria-live", "polite");
  });

  test("晨星基金外链向辅助技术说明新窗口行为", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("#fundBody .fund-link");
    await expect(links).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("aria-label", /晨星详情，新窗口打开/);
    }
  });
});
