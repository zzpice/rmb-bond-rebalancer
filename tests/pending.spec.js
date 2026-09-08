// 类别 12：在途交易
// v1.0.1 真实语义：在途买入填正数、在途卖出填负数；有效持仓 = 已确认 + 在途；
// 在途卖出不得超过对应基金当前持仓（有效持仓不得为负）。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readResult, readStatus, assertInvariants, wanToCents, parseTrade } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

test.describe("在途交易", () => {
  test("在途买入计入有效持仓（实时占比变化）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, pending: [null, null, 2, null] });
    const card = page.locator("#fundBody .fund-card").nth(2);
    await expect(card.locator(".curw")).toHaveText("14.29%");
    await generate(page);
    const result = await readResult(page);
    expect(result.trades).toEqual([0, 0, 0, 0]);
    expect(result.finals).toEqual([48, 32, 14, 4].map(wanToCents));
  });

  test("在途卖出计入有效持仓（实时占比变化）", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, pending: [null, -1.5, null, null] });
    const card = page.locator("#fundBody .fund-card").nth(1);
    await expect(card.locator(".curw")).toHaveText("32.28%");
    await generate(page);
    const result = await readResult(page);
    expect(result.trades).toEqual([0, 0, 0, 0]);
    expect(result.finals).toEqual([48, 30.5, 12, 4].map(wanToCents));
  });

  test("在途买入部分修复低配：调整量基于有效持仓，不重复计算", async ({ page }) => {
    const holdings = [30, 38, 18, 10];
    const pending = [10, 0, 0, 0];
    await page.goto("/");
    await fillPortfolio(page, { holdings, flow: 0, pending });
    await generate(page);
    const result = await readResult(page);
    const effective = [40, 38, 18, 10].map(wanToCents);
    expect(result.trades[0]).toBeGreaterThan(0);
    expect(result.trades[0]).toBeLessThan(wanToCents(15.6));
    assertInvariants(result, { effectiveCents: effective, flowCents: 0 });
    const detailPendingCell = page.locator("#detailBody tr").nth(0).locator("td").nth(2);
    expect(parseTrade(await detailPendingCell.textContent())).toBe(wanToCents(10));
  });

  test("在途卖出导致有效持仓为负 → 明确拒绝并提示", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0, pending: [null, null, null, -5] });
    await generate(page);
    const status = await readStatus(page);
    expect(status.type).toBe("warn");
    expect(status.text).toContain("在途卖出不能超过对应基金的当前持仓");
    await expect(page.locator("#resultBody td.empty")).toBeHidden();
    await expect(page.locator("#resultsCard .block-execution")).toBeHidden();
  });

  test("在途卖出恰好等于持仓（有效持仓为 0）→ 允许，按极端低配处理", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0, pending: [null, null, null, -4] });
    await generate(page);
    const result = await readResult(page);
    expect(result.trades[3]).toBeGreaterThan(0);
    for (const f of result.finals) expect(f).toBeGreaterThanOrEqual(0);
    assertInvariants(result, { effectiveCents: [48, 32, 12, 0].map(wanToCents), flowCents: 0 });
  });
});
