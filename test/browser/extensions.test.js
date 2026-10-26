import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { filterCheck } from '../../src/filter-check/vite.js';
import { CASES, extensionPath } from './extensions.js';

const HOST = 'localtest.me';
const headed = process.env.HEADED === '1';

function same(result, expect) {
  assert.equal(result.detected, expect.detected, JSON.stringify(result));
  assert.equal(result.status, expect.status, JSON.stringify(result));
  if (expect.confidence) assert.equal(result.confidence, expect.confidence, JSON.stringify(result));
  if (expect.probability != null) assert.equal(result.probability, expect.probability, JSON.stringify(result));
  for (const [key, value] of Object.entries(expect.signals)) {
    assert.equal(result.signals[key], value, `${key}: ${JSON.stringify(result)}`);
  }
}

function filtersReady(result, expect) {
  return Object.entries(expect.signals).every(([key, value]) => {
    if (value !== 'blocked') return true;
    return result.signals[key] === 'blocked';
  });
}

async function launch(path) {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !headed,
    slowMo: headed ? 250 : 0,
    viewport: { width: 1100, height: 800 },
    args: path
      ? [`--disable-extensions-except=${path}`, `--load-extension=${path}`]
      : ['--disable-extensions'],
  });
}

async function ubolComplete(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const id = new URL(worker.url()).host;
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
  const level = await dashboard.evaluate(() => chrome.runtime.sendMessage({
    what: 'setDefaultFilteringMode',
    level: 3,
  }));
  await dashboard.close();
  assert.equal(level, 3, 'uBOL не переключился в полный режим');
}

async function showDemo(context, port) {
  if (!headed) return;
  const page = await context.newPage();
  await page.goto(`http://${HOST}:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForSelector(
    '#summary[data-state="active"], #summary[data-state="inactive"], #summary[data-state="unknown"]',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(2500);
  await page.close();
}

async function probe(context, url, expect) {
  const page = await context.newPage();
  let result;
  const attempts = expect.detected ? 5 : 1;
  try {
    for (let i = 0; i < attempts; i += 1) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('html[data-ready="1"]', { timeout: 15_000 });
      result = JSON.parse(await page.locator('html').getAttribute('data-result'));
      if (filtersReady(result, expect)) break;
      await page.waitForTimeout(1500);
    }
    return result;
  } finally {
    await page.close();
  }
}

describe('расширения', () => {
  it('отличает чистый браузер, uBOL, AdGuard, Adblock Plus и Ghostery', async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('../..', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      plugins: [filterCheck()],
      server: { host: '127.0.0.1', port: 0, strictPort: false, allowedHosts: true },
    });
    const failures = [];
    try {
      await server.listen();
      const { port } = server.httpServer.address();
      const url = `http://${HOST}:${port}/test/browser/page.html`;

      for (const spec of CASES) {
        const extension = spec.repo || spec.crx ? await extensionPath(spec) : '';
        const context = await launch(extension);
        try {
          if (extension) {
            const [worker] = context.serviceWorkers();
            if (!worker) await context.waitForEvent('serviceworker', { timeout: 20_000 });
          }
          if (spec.mode === 'complete') await ubolComplete(context);
          const result = await probe(context, url, spec.expect);
          console.log(`${spec.title}: ${result.status}/${result.confidence} ${result.probability}% ${JSON.stringify(result.signals)}`);
          await showDemo(context, port);
          same(result, spec.expect);
        } catch (error) {
          failures.push(`${spec.title}: ${error.message}`);
        } finally {
          await context.close();
        }
      }
    } finally {
      await server.close();
    }
    assert.deepEqual(failures, []);
  });
});
