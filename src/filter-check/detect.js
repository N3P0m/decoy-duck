import { decide } from './verdict.js';
import { probeCosmetic } from './probes/cosmetic.js';
import { probeImagePair, probeScriptPair, probeThirdParty } from './probes/resource.js';
import { applyBase, publicBase } from './urls.js';

const DEFAULT_TIMEOUT = 2500;

/** Адреса проб. Файлы из `baits/` должны отдаваться по этим путям как статика. */
export const defaultBait = {
  scriptUrl: '/ad_header.js',
  imageUrl: '/ads/images/pixel.png',
  controlScriptUrl: '/assets/ctrl.js',
  controlImageUrl: '/assets/pixel.png',
  thirdPartyUrl: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
};

function domReady(signal) {
  if (signal?.aborted) return Promise.resolve(false);
  if (document.readyState !== 'loading') return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    };
    const onAbort = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      resolve(false);
    };
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function blank() {
  return {
    detected: null,
    status: 'unknown',
    confidence: 'low',
    probability: 50,
    signals: {
      cosmetic: 'inconclusive',
      script: 'inconclusive',
      image: 'inconclusive',
      thirdParty: 'inconclusive',
    },
    elapsedMs: 0,
  };
}

/**
 * Проверяет, режет ли страница рекламу.
 * Сетевые bait-файлы не входят в бандл: их URL должны совпасть с правилами фильтра.
 *
 * @param {object} [options]
 * @param {number} [options.timeout=2500] Таймаут сетевых проб, мс.
 * @param {AbortSignal} [options.signal] Отмена проверки.
 * @param {Partial<typeof defaultBait>} [options.bait] Свои URL вместо `defaultBait`.
 * @param {boolean} [options.thirdParty=true] Запрос к рекламному хосту. `false` его не отправляет.
 * @returns {Promise<{
 *   detected: boolean | null,
 *   status: 'active' | 'inactive' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   probability: number,
 *   signals: {
 *     cosmetic: 'blocked' | 'clear' | 'inconclusive',
 *     script: 'blocked' | 'clear' | 'inconclusive',
 *     image: 'blocked' | 'clear' | 'inconclusive',
 *     thirdParty: 'blocked' | 'clear' | 'inconclusive' | 'skipped',
 *   },
 *   elapsedMs: number,
 * }>} `detected === true` только при `status: 'active'`. `null` значит, что ответа нет.
 */
function withBase(bait, base) {
  return {
    ...bait,
    scriptUrl: applyBase(base, bait.scriptUrl),
    imageUrl: applyBase(base, bait.imageUrl),
    controlScriptUrl: applyBase(base, bait.controlScriptUrl),
    controlImageUrl: applyBase(base, bait.controlImageUrl),
  };
}

export async function detectAdblock(options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const bait = withBase({ ...defaultBait, ...options.bait }, publicBase());
  const signal = options.signal;
  const thirdPartyEnabled = options.thirdParty !== false && Boolean(bait.thirdPartyUrl);

  const ready = await domReady(signal);
  if (!ready || signal?.aborted) return blank();

  const started = performance.now();
  const [cosmetic, script, image, thirdParty] = await Promise.all([
    probeCosmetic({ signal }).catch(() => ({ status: 'inconclusive', control: 'error' })),
    probeScriptPair({
      controlUrl: bait.controlScriptUrl,
      baitUrl: bait.scriptUrl,
      timeout,
      signal,
    }).catch(() => ({ status: 'inconclusive', control: 'error' })),
    probeImagePair({
      controlUrl: bait.controlImageUrl,
      baitUrl: bait.imageUrl,
      timeout,
      signal,
    }).catch(() => ({ status: 'inconclusive', control: 'error' })),
    thirdPartyEnabled
      ? probeThirdParty({ url: bait.thirdPartyUrl, timeout, signal }).catch(() => 'failed')
      : Promise.resolve('skipped'),
  ]);

  const controlOk = script.control === 'loaded' || image.control === 'loaded';
  let thirdPartyStatus = 'inconclusive';
  if (thirdParty === 'skipped') thirdPartyStatus = 'skipped';
  else if (thirdParty === 'ok') thirdPartyStatus = 'clear';
  else if (thirdParty === 'failed' && controlOk) thirdPartyStatus = 'blocked';

  const signals = {
    cosmetic: cosmetic.status,
    script: script.status,
    image: image.status,
    thirdParty: thirdPartyStatus,
  };

  return {
    ...decide(signals),
    signals,
    elapsedMs: Math.round(performance.now() - started),
  };
}
