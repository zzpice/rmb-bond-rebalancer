// 类别 15：异常输入
// 全部错误文案来自 v1.0.1 真实代码。验证：不产生 NaN/Infinity、不产生非法负持仓、
// 不产生金额不守恒、页面给出合理错误或拒绝执行。
import { test, expect } from "@playwright/test";
import { fillPortfolio, generate, readStatus } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

async function expectRejection(page, type, textPart) {
  const status = await readStatus(page);
  expect(status.type).toBe(type);
  expect(status.text).toContain(textPart);
  // 拒绝执行：不生成执行清单（结果表保持占位行）
  await expect(page.locator("#resultBody tr")).toHaveCount(1);
  await expect(page.locator("#resultBody td.empty")).toBeVisible();
  // 页面不出现 NaN / Infinity 输出
  const bodyText = await page.locator("#resultsCard").textContent();
  expect(bodyText).not.toContain("NaN");
  expect(bodyText).not.toContain("Infinity");
}

test.describe("异常输入", () => {
  test("空值：未填写任何持仓 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await generate(page);
    await expectRejection(page, "warn", "请把 4 只基金的当前金额全部填写完整");
  });

  test("空值：只填 3 只基金 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [48, 32, 12, null], flow: 0 });
    await generate(page);
    await expectRejection(page, "warn", "请把 4 只基金的当前金额全部填写完整");
  });

  test("非法数字：持仓超过 4 位小数 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [48.00001, 32, 12, 4], flow: 0 });
    await generate(page);
    await expectRejection(page, "warn", "金额须为有效数字，最多保留 4 位小数");
  });

  test("资金变动超过 4 位小数 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 1.00001 });
    await generate(page);
    await expectRejection(page, "bad", "金额须为有效数字，最多保留 4 位小数");
  });

  test("负持仓 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [-1, 32, 12, 4], flow: 0 });
    await generate(page);
    await expectRejection(page, "warn", "当前持仓不能为负数");
  });

  test("全部持仓为 0 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [0, 0, 0, 0], flow: 0 });
    await generate(page);
    await expectRejection(page, "warn", "预计当前总资产必须大于 0");
  });

  test("过大数值：超出精确计算范围 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [4800000, 3200000, 1200000, 400000], flow: 0 });
    await generate(page);
    await expectRejection(page, "warn", "金额超出精确计算范围");
  });

  test("取出资金超过总资产 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -100 });
    await generate(page);
    await expectRejection(page, "bad", "资金变动后的组合总资产必须大于 0");
  });

  test("取出资金恰好等于总资产 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: -96 });
    await generate(page);
    await expectRejection(page, "bad", "资金变动后的组合总资产必须大于 0");
  });

  test("极小数值：默认取整单位下无法满足区间 → 给出可操作的错误提示", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [0.0001, 0.0001, 0.0001, 0.0001], flow: 0 });
    await generate(page);
    await expectRejection(page, "bad", "当前取整单位无法生成满足区间的执行方案");
  });

  test("在途卖出超过对应持仓 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0, pending: [null, null, null, -4.0001] });
    await generate(page);
    await expectRejection(page, "warn", "在途卖出不能超过对应基金的当前持仓");
  });

  test("高级设置留空 → 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    await page.locator("#landingPct").fill("");
    await generate(page);
    await expectRejection(page, "warn", "请填写全部高级设置");
  });

  test("高级设置越界（拉回比例 95%）→ 拒绝执行", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    await page.locator("#landingPct").fill("95");
    await generate(page);
    await expectRejection(page, "warn", "越界后拉回比例须为允许偏差的 10%～90%");
  });
});
