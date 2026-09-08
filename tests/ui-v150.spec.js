import { test, expect } from "@playwright/test";
import { fillPortfolio, generate } from "./helpers.mjs";

const AT_TARGET = [48, 32, 12, 4];

async function expectStateMatchesPosition(row) {
  const data = await row.evaluate(element => {
    const final = Number(element.dataset.finalCents), low = Number(element.dataset.lowCents), high = Number(element.dataset.highCents);
    return {
      state: element.dataset.bandState,
      expected: final < low ? "under" : final > high ? "over" : "ok",
      after: parseFloat(element.querySelector(".pb-after").style.left),
      safeLeft: parseFloat(element.querySelector(".pb-safe").style.left),
      safeRight: parseFloat(element.querySelector(".pb-safe").style.left) + parseFloat(element.querySelector(".pb-safe").style.width)
    };
  });
  expect(data.state).toBe(data.expected);
  expect(data.safeLeft).toBeGreaterThanOrEqual(0);
  expect(data.safeRight).toBeLessThanOrEqual(100);
  if (data.state === "under") expect(data.after).toBeLessThan(data.safeLeft);
  else if (data.state === "over") expect(data.after).toBeGreaterThan(data.safeRight);
  else {
    expect(data.after).toBeGreaterThanOrEqual(data.safeLeft - .001);
    expect(data.after).toBeLessThanOrEqual(data.safeRight + .001);
  }
}

test.describe("v1.5.0 Patch 1 结构整理", () => {
  test("计算过程归入结果区并形成三级计算明细", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#resultsCard #detailBody")).toHaveCount(1);
    await expect(page.locator(".detail-table")).toHaveCount(1);
    expect(await page.locator(".detail-table").evaluate(table => table.closest("#resultsCard") !== null)).toBe(true);
    await expect(page.locator(".result-details > summary")).toHaveText("查看计算明细");
    await expect(page.locator(".result-details h4")).toHaveText(["汇总", "术语说明", "逐基金推导"]);

    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0, pending: [0, 0, 2, 0] });
    await generate(page);
    await page.locator(".result-details > summary").click();
    await expect(page.locator("#detailBody tr")).toHaveCount(4);
    await expect(page.locator("#detailBody tr").nth(2).locator("td").nth(2)).toHaveText("买入 CNY 20,000.00");
  });

  test("删除页脚重复免责声明并保留执行金额风险提示", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footer-risk")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("不构成投资建议");

    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#executionRiskNote")).toBeVisible();
    await expect(page.locator("#executionRiskNote")).toHaveText("执行金额仅供参考，未计入相关费用及确认期间的净值变化。");
  });

  test("高级设置保持原位置、完整功能与降级视觉", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const settings = page.locator("details.settings-card");
    await expect(settings).toHaveCount(1);
    expect(await settings.evaluate(element => {
      const cash = document.getElementById("cashFlowSection");
      const dock = document.querySelector(".action-dock");
      return Boolean(cash.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(element.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(settings.locator(":scope > summary")).toContainText("高级设置");
    await expect(settings.locator(":scope > summary")).toContainText("触发阈值、取整单位与小额交易阈值，一般无需修改");

    const desktopStyle = await settings.evaluate(element => {
      const card = getComputedStyle(element), summary = getComputedStyle(element.querySelector("summary"));
      return { boxShadow: card.boxShadow, radius: card.borderRadius, marginTop: card.marginTop, fontSize: summary.fontSize, fontWeight: summary.fontWeight };
    });
    expect(desktopStyle).toEqual({ boxShadow: "none", radius: "8px", marginTop: "12px", fontSize: "14px", fontWeight: "700" });

    await settings.locator(":scope > summary").click();
    await expect(settings.locator("input.setting")).toHaveCount(5);
    for (const field of await settings.locator("input.setting").all()) await expect(field).toBeVisible();
    await page.locator("#absoluteBandPP").fill("2");
    await page.locator("#restoreDefaults").click();
    await expect(page.locator("#absoluteBandPP")).toHaveValue("5");

    await page.setViewportSize({ width: 375, height: 844 });
    const mobileStyle = await settings.locator(":scope > summary").evaluate(element => {
      const style = getComputedStyle(element);
      return { minHeight: style.minHeight, fontSize: style.fontSize };
    });
    expect(mobileStyle).toEqual({ minHeight: "48px", fontSize: "15px" });
  });
});

test.describe("v1.5.0 Patch 2 调整后区间", () => {
  test("普通建议渲染四行真实区间、唯一百分比文本与静音图形", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [50, 33.3333, 12.5, 4.1667], flow: 10 });
    await generate(page);

    const rows = page.locator("#postBandBody .post-band-row");
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll(elements => elements.map(element => element.dataset.bandState))).toEqual(["ok", "ok", "ok", "ok"]);
    for (let i = 0; i < 4; i++) {
      const row = rows.nth(i), graph = row.locator(".post-band");
      expect(await row.getAttribute("role")).toBeNull();
      const before = (await page.locator("#comparisonBody tr").nth(i).locator(".before-weight").textContent()).trim();
      const after = (await page.locator("#comparisonBody tr").nth(i).locator(".after-weight").textContent()).trim();
      await expect(row.locator(".pb-values")).toHaveText(`${before} → ${after}`);
      await expect(graph).toHaveAttribute("aria-hidden", "true");
      expect(await graph.getAttribute("role")).toBeNull();
      expect(await graph.getAttribute("aria-label")).toBeNull();
      await expect(graph.locator("span")).toHaveCount(4);
      for (const part of await graph.locator("span").all()) await expect(part).toHaveAttribute("aria-hidden", "true");
      await expect(row.locator(".pb-safe")).toHaveCount(1);
      await expect(row.locator(".pb-target")).toHaveCount(1);
      const relation = (await row.locator(".sr-only").textContent()).trim().replace(/^，/, "");
      expect(["位于免调区间内", "低于免调区间", "高于免调区间"]).toContain(relation);
      expect(relation).not.toContain("%");
      expect(((await row.textContent()).match(/%/g) || []).length).toBe(2);
      expect(await graph.textContent()).not.toContain("%");
      await expectStateMatchesPosition(row);
    }

    expect(await page.locator("#postBandBody path").count()).toBe(0);
    const motion = await page.locator("#postBandBody .post-band, #postBandBody .post-band *").evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { transition: style.transitionDuration, animation: style.animationName };
    }));
    for (const item of motion) expect(item).toEqual({ transition: "0s", animation: "none" });
  });

  test("无操作场景的调整前后点按真实位置重合", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#quickDecision")).toHaveText("无需操作");
    const rows = page.locator("#postBandBody .post-band-row");
    for (let i = 0; i < 4; i++) {
      const geometry = await rows.nth(i).evaluate(element => {
        const before = element.querySelector(".pb-before").getBoundingClientRect();
        const after = element.querySelector(".pb-after").getBoundingClientRect();
        return { before: before.left + before.width / 2, after: after.left + after.width / 2 };
      });
      expect(Math.abs(geometry.before - geometry.after)).toBeLessThan(.5);
      const values = await rows.nth(i).locator(".pb-values").textContent();
      const [before, after] = values.split("→").map(value => value.trim());
      expect(after).toBe(before);
    }
  });

  test("越界组合如实显示带外调整前点与带内最终点", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 30, 10, 3], flow: 0 });
    await generate(page);
    const rows = page.locator("#postBandBody .post-band-row");
    const positions = await rows.evaluateAll(elements => elements.map(element => {
      const before = parseFloat(element.querySelector(".pb-before").style.left);
      const low = parseFloat(element.querySelector(".pb-safe").style.left);
      const high = low + parseFloat(element.querySelector(".pb-safe").style.width);
      return { before, low, high, state: element.dataset.bandState };
    }));
    expect(positions.some(item => item.before < item.low || item.before > item.high)).toBe(true);
    expect(positions.map(item => item.state)).toEqual(["ok", "ok", "ok", "ok"]);
    for (let i = 0; i < 4; i++) await expectStateMatchesPosition(rows.nth(i));
  });

  test("取款后的最终点可真实压在免调区间边界", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [50, 33.3333, 12.5, 4.1667], flow: -8 });
    await generate(page);
    const distances = await page.locator("#postBandBody .post-band-row").evaluateAll(elements => elements.map(element => {
      const track = element.querySelector(".post-band").getBoundingClientRect();
      const point = parseFloat(element.querySelector(".pb-after").style.left) / 100 * track.width + track.left;
      const safe = element.querySelector(".pb-safe").getBoundingClientRect();
      return Math.min(Math.abs(point - safe.left), Math.abs(point - safe.right));
    }));
    expect(Math.min(...distances)).toBeLessThan(2);
  });

  test("自定义 absoluteBandPP 改变带宽，恢复默认后复原", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 30, 10, 3], flow: 0 });
    await generate(page);
    const width = () => page.locator("#postBandBody .post-band-row").first().locator(".pb-safe").evaluate(element => parseFloat(element.style.width));
    const defaultWidth = await width();

    await page.locator("details.settings-card > summary").click();
    await page.locator("#absoluteBandPP").fill("2");
    await generate(page);
    const narrowWidth = await width();
    expect(narrowWidth).toBeLessThan(defaultWidth);

    await page.locator("#restoreDefaults").click();
    await expect(page.locator("#absoluteBandPP")).toHaveValue("5");
    await generate(page);
    expect(Math.abs(await width() - defaultWidth)).toBeLessThan(.01);
  });

  test("force 与极端 roundYuan 均按整数金额实算状态", async ({ page }) => {
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 30, 10, 3], flow: 0 });
    await generate(page, { force: true });
    for (const row of await page.locator("#postBandBody .post-band-row").all()) await expectStateMatchesPosition(row);

    await page.reload();
    await fillPortfolio(page, { holdings: [2.4, 0, 0, 0], flow: 0, settings: { roundYuan: 10000 } });
    await generate(page, { force: true });
    const rows = page.locator("#postBandBody .post-band-row");
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll(elements => elements.map(element => element.dataset.bandState))).toEqual(["over", "over", "under", "under"]);
    for (const row of await rows.all()) {
      await expectStateMatchesPosition(row);
      const left = parseFloat(await row.locator(".pb-after").evaluate(element => element.style.left));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
    }
  });

  test("清空输入会清除并隐藏旧区间结果", async ({ page }) => {
    page.on("dialog", dialog => dialog.accept());
    await page.goto("/");
    await fillPortfolio(page, { holdings: AT_TARGET, flow: 0 });
    await generate(page);
    await expect(page.locator("#postBandBody .post-band-row")).toHaveCount(4);
    await page.locator("#clear").click();
    await expect(page.locator("#postBandBody")).toBeEmpty();
    await expect(page.locator(".post-band-panel")).toBeHidden();
    await expect(page.locator("#resultsCard")).toHaveClass(/empty/);
  });

  test("深色主题清晰区分图形且区间条不进入键盘序列", async ({ page }) => {
    await page.goto("/");
    await page.locator("#themeMode").selectOption("dark");
    await fillPortfolio(page, { holdings: [70, 30, 10, 3], flow: 0 });
    await generate(page);
    const colors = await page.locator("#postBandBody .post-band-row").first().evaluate(element => ({
      safe: getComputedStyle(element.querySelector(".pb-safe")).backgroundColor,
      before: getComputedStyle(element.querySelector(".pb-before")).backgroundColor,
      after: getComputedStyle(element.querySelector(".pb-after")).backgroundColor,
      target: getComputedStyle(element.querySelector(".pb-target")).backgroundColor
    }));
    expect(new Set(Object.values(colors)).size).toBe(4);
    await expect(page.locator("#postBandBody a, #postBandBody button, #postBandBody input, #postBandBody select, #postBandBody textarea, #postBandBody [tabindex]")).toHaveCount(0);

    const settings = page.locator("details.settings-card");
    await settings.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(settings).toHaveAttribute("open", "");
  });

  test("375px、960px 与 1440px 均保持紧凑且无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await fillPortfolio(page, { holdings: [70, 30, 10, 3], flow: 0 });
    await generate(page);

    for (const width of [375, 960, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".post-band-panel").getBoundingClientRect();
        const comparisonWrap = document.querySelector(".comparison-table").closest(".table-wrap");
        const firstRow = document.querySelector(".post-band-row").getBoundingClientRect();
        const firstBand = document.querySelector(".post-band").getBoundingClientRect();
        const firstFund = document.querySelector(".pb-fund").getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          panelLeft: panel.left,
          panelRight: panel.right,
          panelHeight: panel.height,
          rowHeight: firstRow.height,
          bandBelowFund: firstBand.top >= firstFund.bottom,
          bandAlignedWithFund: Math.abs((firstBand.top + firstBand.height / 2) - (firstFund.top + firstFund.height / 2)) <= 1,
          comparisonScrollWidth: comparisonWrap.scrollWidth,
          comparisonClientWidth: comparisonWrap.clientWidth
        };
      });
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.panelLeft).toBeGreaterThanOrEqual(-.5);
      expect(layout.panelRight).toBeLessThanOrEqual(width + .5);
      if (width === 375) {
        expect(layout.rowHeight).toBeLessThanOrEqual(52);
        expect(layout.bandBelowFund).toBe(true);
      } else {
        expect(layout.panelHeight).toBeLessThanOrEqual(150);
        expect(layout.bandAlignedWithFund).toBe(true);
        expect(layout.comparisonScrollWidth).toBeLessThanOrEqual(layout.comparisonClientWidth + 1);
      }
    }
  });
});
