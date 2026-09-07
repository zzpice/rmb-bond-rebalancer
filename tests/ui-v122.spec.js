import { test, expect } from "@playwright/test";

const FUNDS = [
  { name: "景顺长城景盛双息 A", code: "002065", category: "固收增强", href: "https://www.morningstar.cn/fund/002065.html" },
  { name: "易方达增强回报 A", code: "110017", category: "固收增强", href: "https://www.morningstar.cn/fund/110017.html" },
  { name: "广发纯债 A", code: "270048", category: "纯债", href: "https://www.morningstar.cn/fund/270048.html" },
  { name: "长城短债 A", code: "007194", category: "短债", href: "https://www.morningstar.cn/fund/007194.html" }
];

test.describe("v1.2.2 文案与基金命名", () => {
  test("基金卡使用精简名称、真实代码与分类标签，并链接到晨星", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("#fundBody .fund-card");
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < FUNDS.length; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".fund-link")).toContainText(FUNDS[i].name);
      await expect(card.locator(".fund-link")).toHaveAttribute("href", FUNDS[i].href);
      await expect(card.locator(".code")).toHaveText(FUNDS[i].code);
      await expect(card.locator(".role")).toHaveText(FUNDS[i].category);
    }
  });

  test("核心操作与结果区使用精简后的措辞", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#clear")).toHaveText("清空输入");
    await expect(page.locator("#force")).toHaveText("按目标比例调整");
    await expect(page.locator(".force-hint")).toHaveText("忽略免调范围，直接回到目标附近");
    await expect(page.locator("#resultsCard > h2")).toHaveText("3. 执行建议");
    await expect(page.locator(".comparison-title h3")).toHaveText("调整前后");
  });

  test("卖出设置与高级设置使用更准确的名称", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".special-panel > summary")).toHaveText("在途交易与卖出设置");
    await page.locator(".special-panel > summary").click();
    await expect(page.locator(".sell-policy").first()).toHaveAccessibleName(/卖出策略/);
    await page.locator("details.card > summary", { hasText: "高级设置" }).click();
    await expect(page.locator("label[for='landingPct']")).toHaveText("越界后回调比例（%）");
    await expect(page.locator("label[for='minTradeYuan']")).toHaveText("小额交易阈值（CNY）");
  });
});
