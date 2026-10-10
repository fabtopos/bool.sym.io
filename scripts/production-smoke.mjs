import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Serve only the built artifact, both at / and a Pages-style project path.
// This catches relative asset mistakes that a development server can conceal.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
await readFile(resolve(root, 'index.html'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.startsWith('/bool.sym.io/')) path = path.slice('/bool.sym.io'.length);
    if (path.endsWith('/')) path += 'index.html';
    const target = resolve(root, '.' + path);
    if (!target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolveReady, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveReady);
});

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // The smoke check must work without access to a font CDN.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  const errors = [];
  const failedAssets = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:') && response.status() >= 400) failedAssets.push(response.url());
  });
  for (const mount of ['/', '/bool.sym.io/']) {
    await page.goto(`http://127.0.0.1:${server.address().port}${mount}`);
    await expect(page.getByRole('heading', { name: 'Boolean Network Simulator', exact: true })).toBeVisible();
    await expect(page.locator('#state-count')).toHaveText('8 states');
    await expect(page.locator('#current-state')).toHaveText('000');
    await page.locator('#step-button').click();
    await expect(page.locator('#current-state')).toHaveText('100');
    await page.locator('#reset-button').click();
    await page.locator('#speed').focus();
    await page.locator('#speed').press('End');
    await page.locator('#play-button').click();
    await expect(page.locator('#terminal-message')).toContainText('Cycle detected. Period = 6.');
    await expect(page.locator('#current-time')).toHaveText('t = 6');
    await expect(page.locator('#history li')).toHaveCount(7);
    await page.locator('#mode-ternary').click();
    await expect(page.getByRole('heading', { name: 'Ternary Network Simulator', exact: true })).toBeVisible();
    await expect(page.locator('#state-count')).toHaveText('9 states');
    await expect(page.locator('#current-state')).toHaveText('00');
    await page.locator('#initial-state').fill('12');
    await page.locator('#step-button').click();
    await expect(page.locator('#current-state')).toHaveText('21');
    await page.locator('#initial-state').fill('00');
    await page.locator('#play-button').click();
    await expect(page.locator('#terminal-message')).toContainText('Cycle detected. Period = 3.');
    await expect(page.locator('#current-time')).toHaveText('t = 4');
    await expect(page.locator('#history li')).toHaveCount(5);
    await page.goto(`http://127.0.0.1:${server.address().port}${mount}?module=ternary`);
    await expect(page.getByRole('heading', { name: 'Ternary Network Simulator', exact: true })).toBeVisible();
    await expect(page.locator('#current-state')).toHaveText('00');
    console.log(`Production smoke passed at ${mount}: assets, both modules, synchronous steps, resets, period-six/three playback, and direct ternary links.`);
  }
  assert.deepEqual(errors, [], 'Production JavaScript errors');
  assert.deepEqual(failedAssets, [], 'Missing production assets');
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
