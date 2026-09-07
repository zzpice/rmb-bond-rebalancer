// 第八部分：黄金测试（固定输入 → 固定输出）
// cases.json 中的期望值由 v1.0.1 真实代码实际运行生成并钉死（见 tests/golden/generate.mjs）。
// 本测试驱动真实页面，逐分核对最终操作与交易后金额，锁定 v1.0.1 当前真实行为。
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fillPortfolio, generate, readResult, assertInvariants } from "./helpers.mjs";

const { cases } = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "golden", "cases.json"),
  "utf8"
));

test.describe("黄金测试（锁定 v1.0.1 真实行为）", () => {
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await page.goto("/");
      await fillPortfolio(page, {
        holdings: c.input.holdings,
        flow: c.input.flow,
        pending: c.input.pending,
        policies: c.input.policies,
        settings: c.input.settings
      });
      await generate(page, { force: c.input.force });
      const result = await readResult(page);
      expect(result.trades).toEqual(c.expected.trades);
      expect(result.finals).toEqual(c.expected.finals);
      // 黄金用例同时必须满足数学不变量
      const effective = c.input.holdings.map((h, i) => Math.round((h + (c.input.pending?.[i] || 0)) * 10000) * 100);
      assertInvariants(result, {
        effectiveCents: effective,
        flowCents: Math.round(c.input.flow * 10000) * 100,
        policies: c.input.policies || null
      });
    });
  }
});
