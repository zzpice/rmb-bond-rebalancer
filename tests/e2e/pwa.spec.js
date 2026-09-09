import { test, expect } from "@playwright/test";

test("PWA 外壳、模块与在线更新可用", async ({ page, request }) => {
  const assets = [
    "/manifest.webmanifest",
    "/service-worker.js",
    "/styles/app.css",
    "/src/app.js",
    "/src/portfolio.js",
    "/src/rebalance.js",
    "/src/format.js",
    "/icons/icon.svg"
  ];
  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.ok(), asset).toBe(true);
  }

  await page.goto("/");
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, active: Boolean(ready.active) };
  });
  expect(registration.active).toBe(true);
  expect(await page.evaluate(() => caches.keys())).toContain("rmb-rebalancer-v2.0.1");

  await page.evaluate(async () => {
    const cache = await caches.open("rmb-rebalancer-v2.0.1");
    const url = new URL("./src/app.js", location.href).href;
    await cache.put(url, new Response("throw new Error('stale app');", {
      headers: { "content-type": "application/javascript" }
    }));
  });

  await page.reload();
  await expect(page.locator(".holding-input")).toHaveCount(4);
  const cachedApp = await page.evaluate(async () => {
    const cache = await caches.open("rmb-rebalancer-v2.0.1");
    const response = await cache.match(new URL("./src/app.js", location.href).href);
    return response?.text();
  });
  expect(cachedApp).toContain("from \"./portfolio.js\"");
});

test("Service Worker 重新激活时清理 v1 与旧 v2 缓存", async ({ page }) => {
  const legacyCaches = [
    "bond-rebalancer-v1.5.0",
    "rmb-rebalancer-v0.0.0-legacy"
  ];

  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.evaluate(async cacheNames => {
    await Promise.all(cacheNames.map(cacheName => caches.open(cacheName)));
  }, legacyCaches);

  const before = await page.evaluate(() => caches.keys());
  legacyCaches.forEach(cacheName => expect(before).toContain(cacheName));

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error("Service Worker 未注册");
    await registration.unregister();
  });

  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(
    expect.not.arrayContaining(legacyCaches)
  );
});
