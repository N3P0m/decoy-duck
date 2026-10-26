import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const cacheRoot = join(dirname(fileURLToPath(import.meta.url)), '../../.cache/extensions');

/**
 * Сборки, которые Chromium 141 ещё грузит (Manifest V3).
 * Полный uBlock Origin в релизе 1.75 — Manifest V2, этот браузер его не включает.
 * Кэш лежит в `.cache/extensions` и в git не попадает.
 */
export const CASES = [
  {
    id: 'none',
    title: 'без расширения',
    expect: {
      detected: false,
      status: 'inactive',
      confidence: 'high',
      probability: 5,
      signals: {
        cosmetic: 'clear',
        script: 'clear',
        image: 'clear',
        thirdParty: 'skipped',
      },
    },
  },
  {
    id: 'ubol',
    title: 'uBlock Origin Lite, оптимальный режим',
    repo: 'uBlockOrigin/uBOL-home',
    asset: /^uBOLite_.+\.chromium\.zip$/,
    expect: {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
      signals: {
        cosmetic: 'clear',
        script: 'blocked',
        image: 'blocked',
        thirdParty: 'skipped',
      },
    },
  },
  {
    id: 'ubol-complete',
    title: 'uBlock Origin Lite, полный режим',
    repo: 'uBlockOrigin/uBOL-home',
    asset: /^uBOLite_.+\.chromium\.zip$/,
    cacheId: 'ubol',
    mode: 'complete',
    expect: {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
      signals: {
        cosmetic: 'blocked',
        script: 'blocked',
        image: 'blocked',
        thirdParty: 'skipped',
      },
    },
  },
  {
    id: 'adguard',
    title: 'AdGuard',
    repo: 'AdguardTeam/AdguardBrowserExtension',
    asset: /^chrome-mv3\.zip$/,
    expect: {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
      signals: {
        cosmetic: 'clear',
        script: 'blocked',
        image: 'blocked',
        thirdParty: 'skipped',
      },
    },
  },
  {
    id: 'adblock-plus',
    title: 'Adblock Plus',
    crx: 'cfhdojbkjhnklbpkdaibdccddilifddb',
    expect: {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
      signals: {
        cosmetic: 'blocked',
        script: 'blocked',
        image: 'blocked',
        thirdParty: 'skipped',
      },
    },
  },
  {
    id: 'ghostery',
    title: 'Ghostery',
    repo: 'ghostery/ghostery-extension',
    asset: /^ghostery-automation-chromium-.+\.zip$/,
    expect: {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
      signals: {
        cosmetic: 'blocked',
        script: 'blocked',
        image: 'blocked',
        thirdParty: 'skipped',
      },
    },
  },
];

async function latestAsset(repo, pattern) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'decoy-duck-browser-tests',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${repo}: ${response.status}`);
  }
  const release = await response.json();
  const asset = (release.assets || []).find((item) => pattern.test(item.name));
  if (!asset) {
    throw new Error(`В ${repo}@${release.tag_name} нет сборки ${pattern}`);
  }
  return asset;
}

function manifestDir(root) {
  if (existsSync(join(root, 'manifest.json'))) return root;
  for (const name of readdirSync(root)) {
    const nested = join(root, name);
    if (existsSync(join(nested, 'manifest.json'))) return nested;
  }
  throw new Error(`В ${root} нет manifest.json`);
}

async function crxVersion(id) {
  const query = new URLSearchParams({
    response: 'updatecheck',
    prodversion: '141.0.7390.37',
    acceptformat: 'crx3',
    x: `id=${id}&uc`,
  });
  const response = await fetch(`https://clients2.google.com/service/update2/crx?${query}`);
  if (!response.ok) throw new Error(`Chrome не отдал версию ${id}: ${response.status}`);
  const xml = await response.text();
  const version = xml.match(/<updatecheck\b[^>]*\bversion="([^"]+)"/)?.[1];
  if (!version) throw new Error(`В ответе Chrome нет версии ${id}`);
  return version;
}

async function crxPath(spec) {
  const version = await crxVersion(spec.crx);
  const folder = join(cacheRoot, spec.id, version);
  if (!existsSync(join(folder, '.ready'))) {
    rmSync(dirname(folder), { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    const query = new URLSearchParams({
      response: 'redirect',
      prodversion: '141.0.7390.37',
      acceptformat: 'crx3',
      x: `id=${spec.crx}&uc`,
    });
    const response = await fetch(`https://clients2.google.com/service/update2/crx?${query}`);
    if (!response.ok) throw new Error(`Не скачался Adblock Plus: ${response.status}`);
    const packed = Buffer.from(await response.arrayBuffer());
    if (packed.subarray(0, 4).toString() !== 'Cr24') {
      throw new Error('Ответ Chrome — не CRX');
    }
    const zip = packed.subarray(12 + packed.readUInt32LE(8));
    const zipPath = join(dirname(folder), `${spec.id}.zip`);
    writeFileSync(zipPath, zip);
    await execFileAsync('unzip', ['-qo', zipPath, '-d', folder]);
    writeFileSync(join(folder, '.ready'), version);
  }
  return manifestDir(folder);
}

export async function extensionPath(spec) {
  if (spec.crx) return crxPath(spec);
  const asset = await latestAsset(spec.repo, spec.asset);
  const folder = join(cacheRoot, spec.cacheId || spec.id, asset.name.replace(/\.zip$/, ''));
  if (!existsSync(join(folder, '.ready'))) {
    rmSync(dirname(folder), { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    const response = await fetch(asset.browser_download_url);
    if (!response.ok) {
      throw new Error(`Не скачался ${asset.name}: ${response.status}`);
    }
    const zip = join(dirname(folder), asset.name);
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    await execFileAsync('unzip', ['-qo', zip, '-d', folder]);
    writeFileSync(join(folder, '.ready'), asset.browser_download_url);
  }
  return manifestDir(folder);
}
