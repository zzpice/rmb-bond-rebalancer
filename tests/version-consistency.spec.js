import { test, expect } from "@playwright/test";

test("当前发布版本标记保持一致", async ({ page, request }) => {
  const releaseVersion = "1.6.0";
  await page.goto("/");
  await expect(page.locator("footer.footer")).toContainText(`v${releaseVersion}`);

  const sw = await request.get("/service-worker.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain(`v${releaseVersion}`);

  const pkg = await request.get("/package.json");
  expect(pkg.ok()).toBe(true);
  expect((await pkg.json()).version).toBe(releaseVersion);

  const lock = await request.get("/package-lock.json");
  expect(lock.ok()).toBe(true);
  const lockJson = await lock.json();
  expect(lockJson.version).toBe(releaseVersion);
  expect(lockJson.packages[""].version).toBe(releaseVersion);
});
