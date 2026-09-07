import { test, expect } from "@playwright/test";

test.describe("刷新版本", () => {
  test("已有 Service Worker 时主动检查更新并重新加载", async ({ page }) => {
    await page.addInitScript(() => {
      const registration = {
        installing: null,
        waiting: null,
        update: async () => sessionStorage.setItem("sw-update-called", "yes")
      };
      Object.defineProperty(navigator.serviceWorker, "getRegistration", {
        configurable: true,
        value: async () => registration
      });
    });
    await page.goto("/");
    await page.locator("#refreshVersion").click();
    await page.waitForLoadState("load");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("sw-update-called"))).toBe("yes");
  });

  test("离线时不尝试刷新并给出明确反馈", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.locator("#refreshVersion").click();
    await expect(page.locator("#refreshVersion")).toHaveText("当前离线");
    await expect(page.locator("#refreshVersion")).toBeDisabled();
  });
});
