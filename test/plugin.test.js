import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { build, createServer } from 'vite';
import { copyBaits, filterCheck } from '../src/filter-check/vite.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'filter-check-'));
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(root, 'main.js'),
    "import { detectAdblock } from 'decoy-duck'\nwindow.__detect = detectAdblock\n",
  );
  return root;
}

describe('filterCheck', () => {
  it('отдаёт bait под base в dev-сервере', async () => {
    const root = await fixture();
    const server = await createServer({
      root,
      base: '/app/',
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [filterCheck()],
    });
    try {
      await server.listen();
      const { port } = server.httpServer.address();
      const response = await fetch(`http://127.0.0.1:${port}/app/ad_header.js?t=1`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /__hdrBag/);
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('кладёт bait в outDir проекта и подставляет base в модуль', async () => {
    const root = await fixture();
    const outDir = 'site-out';
    try {
      await build({
        root,
        base: '/app/',
        configFile: false,
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
        plugins: [filterCheck()],
      });
      const script = await readFile(join(root, outDir, 'ad_header.js'), 'utf8');
      assert.match(script, /__hdrBag/);
      const assetsDir = join(root, outDir, 'assets');
      const names = readdirSync(assetsDir).filter((name) => name.endsWith('.js') && name !== 'ctrl.js');
      const bundles = await Promise.all(names.map((name) => readFile(join(assetsDir, name), 'utf8')));
      const bundle = bundles.find((text) => text.includes('ad_header'));
      assert.ok(bundle, names.join(', '));
      assert.match(bundle, /\/app\//);
      assert.equal(existsSync(join(process.cwd(), outDir)), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('не затирает чужой файл с тем же путём', () => {
    const root = mkdtempSync(join(tmpdir(), 'filter-check-copy-'));
    try {
      writeFileSync(join(root, 'ad_header.js'), 'other');
      assert.throws(() => copyBaits(root), /ad_header\.js/);
      assert.equal(readFileSync(join(root, 'ad_header.js'), 'utf8'), 'other');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
