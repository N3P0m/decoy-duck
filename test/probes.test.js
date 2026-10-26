import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { detectAdblock, defaultBait, decide } from '../src/filter-check/index.js';
import { probeCosmetic } from '../src/filter-check/probes/cosmetic.js';
import { probeScriptPair, probeThirdParty } from '../src/filter-check/probes/resource.js';

const previous = {};

function remember() {
  previous.document = globalThis.document;
  previous.Image = globalThis.Image;
  previous.fetch = globalThis.fetch;
  previous.getComputedStyle = globalThis.getComputedStyle;
  previous.requestAnimationFrame = globalThis.requestAnimationFrame;
  previous.MutationObserver = globalThis.MutationObserver;
  previous.ctl = globalThis.__ctlBag;
  previous.hdr = globalThis.__hdrBag;
}

function restore() {
  globalThis.document = previous.document;
  globalThis.Image = previous.Image;
  globalThis.fetch = previous.fetch;
  globalThis.getComputedStyle = previous.getComputedStyle;
  globalThis.requestAnimationFrame = previous.requestAnimationFrame;
  globalThis.MutationObserver = previous.MutationObserver;
  if (previous.ctl === undefined) delete globalThis.__ctlBag;
  else globalThis.__ctlBag = previous.ctl;
  if (previous.hdr === undefined) delete globalThis.__hdrBag;
  else globalThis.__hdrBag = previous.hdr;
}

function installBrowser({ height = 10, hangScript = false } = {}) {
  remember();
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 1;
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'div') {
        return {
          className: '',
          style: {},
          isConnected: true,
          offsetHeight: height,
          offsetWidth: height,
          setAttribute() {},
          remove() { this.isConnected = false; },
          getClientRects() { return this.offsetHeight ? [{}] : []; },
        };
      }

      const script = {
        onload: null,
        onerror: null,
        async: false,
        remove() {},
        set src(value) {
          script.currentSrc = value;
          const token = new URL(value, 'http://local.test').searchParams.get('t');
          const bagName = value.includes('ad_header') ? '__hdrBag' : '__ctlBag';
          const bag = globalThis[bagName] || (globalThis[bagName] = Object.create(null));
          bag[token] = 1;
          if (!hangScript) queueMicrotask(() => script.onload?.());
        },
      };
      return script;
    },
  };
}

describe('probeCosmetic', () => {
  afterEach(restore);

  it('видит схлопнутый элемент', async () => {
    installBrowser({ height: 0 });
    assert.deepEqual(await probeCosmetic(), { status: 'blocked' });
  });

  it('уважает уже отменённый сигнал', async () => {
    const signal = AbortSignal.abort();
    assert.deepEqual(await probeCosmetic({ signal }), { status: 'inconclusive' });
  });
});

describe('probeScriptPair', () => {
  afterEach(restore);

  it('убирает токены после успешной загрузки', async () => {
    installBrowser();
    const result = await probeScriptPair({
      controlUrl: '/assets/ctrl.js',
      baitUrl: '/ad_header.js',
      timeout: 200,
    });
    assert.equal(result.status, 'clear');
    assert.equal(globalThis.__ctlBag, undefined);
    assert.equal(globalThis.__hdrBag, undefined);
  });

  it('убирает токен после таймаута', async () => {
    installBrowser({ hangScript: true });
    const result = await probeScriptPair({
      controlUrl: '/assets/ctrl.js',
      baitUrl: '/ad_header.js',
      timeout: 20,
    });
    assert.equal(result.status, 'inconclusive');
    assert.equal(globalThis.__ctlBag, undefined);
    assert.equal(globalThis.__hdrBag, undefined);
  });
});

describe('probeThirdParty', () => {
  afterEach(restore);

  it('возвращает aborted, если сигнал уже отменён', async () => {
    assert.equal(await probeThirdParty({
      url: 'http://127.0.0.1:9/',
      timeout: 1000,
      signal: AbortSignal.abort(),
    }), 'aborted');
  });

  it('считает тишину сервера неудачей по таймауту', async () => {
    const server = createServer(() => {});
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      assert.equal(await probeThirdParty({
        url: `http://127.0.0.1:${port}/stay`,
        timeout: 30,
      }), 'failed');
    } finally {
      server.close();
    }
  });
});

describe('detectAdblock', () => {
  afterEach(restore);

  it('публичный API отдаёт bait и вердикт', () => {
    assert.equal(defaultBait.scriptUrl, '/ad_header.js');
    assert.equal(typeof detectAdblock, 'function');
    assert.equal(typeof decide, 'function');
  });

  it('завершается сразу, если сигнал отменён до DOMContentLoaded', async () => {
    remember();
    const listeners = new Map();
    globalThis.document = {
      readyState: 'loading',
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name) { listeners.delete(name); },
    };
    const controller = new AbortController();
    const pending = detectAdblock({ signal: controller.signal, thirdParty: false });
    controller.abort();
    const result = await pending;
    assert.equal(result.status, 'unknown');
    assert.equal(result.detected, null);
    assert.equal(listeners.has('DOMContentLoaded'), false);
  });

  it('не ходит к чужому хосту, когда сторонняя проба выключена', async () => {
    installBrowser({ height: 0 });
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response());
    };
    const result = await detectAdblock({ thirdParty: false, timeout: 200 });
    assert.equal(calls, 0);
    assert.equal(result.signals.thirdParty, 'skipped');
    assert.equal(result.detected, true);
    assert.equal(result.confidence, 'medium');
    assert.equal(result.probability, 60);
  });
});
