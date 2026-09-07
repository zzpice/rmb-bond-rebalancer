import { test, expect } from "@playwright/test";

test.describe("刷新版本", () => {
  test("已有 Service Worker 时主动检查更新并重新加载", async ({ page }) => {
    await page.addInitScript(() => {
      if (window.top === window) {
        const loads = Number(sessionStorage.getItem("document-load-count") || 0);
        sessionStorage.setItem("document-load-count", String(loads + 1));
      }
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
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("document-load-count"))).toBe("1");

    const reloaded = page.waitForEvent("framenavigated", {
      predicate: frame => frame === page.mainFrame(),
      timeout: 5000
    });
    await page.locator("#refreshVersion").click();
    await reloaded;
    await page.waitForLoadState("load");

    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("sw-update-called"))).toBe("yes");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("document-load-count"))).toBe("2");
    expect(await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type)).toBe("reload");
  });

  test("离线时不尝试刷新并给出明确反馈", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.locator("#refreshVersion").click();
    await expect(page.locator("#refreshVersion")).toHaveText("当前离线");
    await expect(page.locator("#refreshVersion")).toBeDisabled();
  });
});
