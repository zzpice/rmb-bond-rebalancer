// 类别 11：赎回限制
// v1.0.1 实际支持三档（SELL_POLICIES）：normal 可以正常卖出 / avoid 尽量不卖 / forbid 禁止卖出。
// - forbid：任何路径都不得卖出；若越界必须卖出则报错
// - avoid：卖出优先级低于 normal（代码 sellPriority 与评分中的 avoidSell 惩罚）
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("禁止卖出（forbid）", () => {
  test("高配越界但被禁止卖出 → 明确报错，不产生建议", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 0, policies: ["forbid", null, null, null] });
    await generate(page);
    const status = await readStatus(page);
    expect(status.type).toBe("bad");
    expect(status.text).toContain("002065 已高配越界，但被设为禁止卖出");
    await expect(page.locator("#resultBody tr")).toHaveCount(1);
    await expect(page.locator("#resultBody td.empty")).toBeVisible();
  });

  test("强制回到目标需要卖出被禁基金 → 明确报错", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 14, 8, 4], flow: 0, policies: ["forbid", null, null, null] });
    await generate(page, { force: true });
    const status = await readStatus(page);
    expect(status.type).toBe("bad");
    expect(status.text).toContain("强制目标需要卖出已设为禁止卖出的基金");
  });

  test("禁止卖出的低配基金仍可正常买入（forbid 只禁卖）", async ({ page }) => {
    const holdings = [30, 38, 18, 10];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0, policies: ["forbid", null, null, null] });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[0]).toBeGreaterThan(0);
    assertInvariants(result, {
      effectiveCents: holdings.map(wanToCents),
      flowCents: 0,
      policies: ["forbid", "normal", "normal", "normal"]
    });
  });

  test("取出资金时禁止卖出被严格遵守：绕过被禁基金（已用真实代码验证场景可解）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -5, policies: [null, null, "forbid", "forbid"] });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[2]).toBe(0);
    expect(result.trades[3]).toBe(0);
    expect(result.trades[0] + result.trades[1]).toBe(wanToCents(-5));
    assertInvariants(result, {
      effectiveCents: AT_TARGET.map(wanToCents),
      flowCents: wanToCents(-5),
      policies: ["normal", "normal", "forbid", "forbid"]
    });
  });

  test("取出导致被禁基金被动超配越界 → 明确报错（真实行为）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -20, policies: [null, null, "forbid", "forbid"] });
    await generate(page);
    const status = await readStatus(page);
    expect(status.type).toBe("bad");
    expect(status.text).toContain("270048 已高配越界，但被设为禁止卖出");
  });

  test("所有可达路径下禁止卖出基金都不会产生卖出（多场景扫描）", async ({ page }) => {
    const scenarios = [
      { holdings: AT_TARGET, flow: 5 },
      { holdings: AT_TARGET, flow: -5 },
      { holdings: [44, 32, 16, 4], flow: 0 },
      { holdings: [36, 38, 18, 4], flow: 10 }
    ];
    for (const s of scenarios) {
      await page.goto("/");
      await fillPortfolio(page, { ...s, policies: [null, null, null, "forbid"] });
      await generate(page);
      const result = await readResult(page);
      expect(result.trades[3]).toBeGreaterThanOrEqual(0);
      assertInvariants(result, {
        effectiveCents: s.holdings.map(wanToCents),
        flowCents: wanToCents(s.flow),
        policies: ["normal", "normal", "normal", "forbid"]
      });
    }
  });
});

test.describe("尽量不卖（avoid）", () => {
  test("取出资金时 avoid 基金卖出量低于 normal（真实优先级行为）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -24, policies: [null, null, null, "avoid"] });
    await generate(page);
    const avoidResult = await readResult(page);

    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -24 });
    await generate(page);
    const normalResult = await readResult(page);

    expect(-avoidResult.trades[3]).toBeLessThan(-normalResult.trades[3]);
    const sum = a => a.reduce((s, x) => s + x, 0);
    expect(sum(avoidResult.trades)).toBe(wanToCents(-24));
    assertInvariants(avoidResult, {
      effectiveCents: AT_TARGET.map(wanToCents),
      flowCents: wanToCents(-24),
      policies: ["normal", "normal", "normal", "avoid"]
    });
  });

  test("avoid 不等于禁止：其他基金容量不足时仍会被卖出", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -48, policies: [null, null, null, "avoid"] });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[3]).toBeLessThan(0);
    assertInvariants(result, {
      effectiveCents: AT_TARGET.map(wanToCents),
      flowCents: wanToCents(-48),
      policies: ["normal", "normal", "normal", "avoid"]
    });
  });
});
