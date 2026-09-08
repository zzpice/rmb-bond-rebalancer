import { test, expect } from "@playwright/test";
import { fillPortfolio, generate } from "./helpers.mjs";

const PORTFOLIO = { holdings: [52, 31, 11, 5], flow: 8 };

async function useTheme(page, theme) {
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
}

test.describe("v1.6.0 视觉系统保护", () => {
  test("普通 card 保持无阴影、1px 边框与 8px 圆角", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const style = await page.locator("#holdingsSection").evaluate(element => {
      const computed = getComputedStyle(element);
      return { shadow: computed.boxShadow, radius: computed.borderRadius, border: computed.borderTopWidth };
    });
    expect(style).toEqual({ shadow: "none", radius: "8px", border: "1px" });
  });

  test("sidebar 在浅色、active 与深色主题下使用锁定样式", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await useTheme(page, "light");
    await expect(page.locator(".desktop-sidebar")).toHaveCSS("background-color", "rgb(244, 247, 255)");
    await expect(page.locator(".desktop-sidebar .workspace-nav-item.active")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await useTheme(page, "dark");
    await expect(page.locator(".desktop-sidebar")).toHaveCSS("background-color", "rgb(9, 13, 21)");
  });

  test("H1 在桌面与移动断点使用锁定字号和字重", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".header h1")).toHaveCSS("font-size", "28px");
    await expect(page.locator(".header h1")).toHaveCSS("font-weight", "800");

    await page.setViewportSize({ width: 375, height: 844 });
    await expect(page.locator(".header h1")).toHaveCSS("font-size", "24px");
    await page.setViewportSize({ width: 374, height: 844 });
    await expect(page.locator(".header h1")).toHaveCSS("font-size", "22px");
  });

  test("普通控件在桌面为 40px、移动为 48px，圆角均为 8px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#cashFlow")).toHaveCSS("min-height", "40px");
    await expect(page.locator("#cashFlow")).toHaveCSS("border-radius", "8px");

    await page.setViewportSize({ width: 375, height: 844 });
    await expect(page.locator("#cashFlow")).toHaveCSS("min-height", "48px");
    await expect(page.locator("#cashFlow")).toHaveCSS("border-radius", "8px");
  });

  test("#check 专门保护桌面 46px 与移动 48px 的 cascade", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#check")).toHaveCSS("min-height", "46px");
    await page.setViewportSize({ width: 375, height: 844 });
    await expect(page.locator("#check")).toHaveCSS("min-height", "48px");
  });

  test("table 表头与数据密度正确，dark 不泄漏 light text-secondary", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await fillPortfolio(page, PORTFOLIO);
    await generate(page);

    const th = page.locator(".result-table th").first();
    const td = page.locator(".result-table tbody td").first();
    await expect(th).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(th).toHaveCSS("font-size", "12px");
    await expect(th).toHaveCSS("font-weight", "800");
    await expect(td).toHaveCSS("font-size", "14px");

    await useTheme(page, "dark");
    await expect(th).toHaveCSS("color", "rgb(179, 188, 201)");
    expect(await th.evaluate(element => getComputedStyle(element).color)).not.toBe("rgb(69, 70, 77)");
  });

  test("post-band 保持静音且 band-track 原有层级不减少", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, PORTFOLIO);
    await generate(page);

    const track = page.locator(".band-track").first();
    await expect(track.locator(":scope > .band-safe")).toHaveCount(1);
    await expect(track.locator(":scope > .band-inner-zone")).toHaveCount(1);
    await expect(track.locator(":scope > .band-inner")).toHaveCount(2);
    await expect(track.locator(":scope > .band-target")).toHaveCount(1);
    await expect(track.locator(":scope > .band-current")).toHaveCount(1);
    expect(await track.evaluate(element => getComputedStyle(element, "::before").content)).not.toBe("none");

    const motion = await page.locator(".post-band, .post-band *").evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { transition: style.transitionDuration, animation: style.animationName };
    }));
    for (const item of motion) expect(item).toEqual({ transition: "0s", animation: "none" });
    await expect(page.locator(".post-band").first().locator(":scope > .pb-before, :scope > .pb-safe, :scope > .pb-target, :scope > .pb-after")).toHaveCount(4);
  });

  test("375、960 与 1440 均无页面级横向溢出", async ({ page }) => {
    for (const width of [375, 960, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await fillPortfolio(page, PORTFOLIO);
      await generate(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });

  test("真实 section title 在 light 与 dark 下等于当前 text-secondary", async ({ page }) => {
    await page.goto("/");
    const title = page.locator("#holdingsSection h2");
    for (const [theme, expected] of [["light", "rgb(69, 70, 77)"], ["dark", "rgb(179, 188, 201)"]]) {
      await useTheme(page, theme);
      const colors = await title.evaluate(element => {
        const probe = document.createElement("span");
        probe.style.color = "var(--text-secondary)";
        document.body.appendChild(probe);
        const result = { title: getComputedStyle(element).color, token: getComputedStyle(probe).color };
        probe.remove();
        return result;
      });
      expect(colors.title).toBe(expected);
      expect(colors.title).toBe(colors.token);
    }
  });
});
