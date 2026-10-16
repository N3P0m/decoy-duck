import { build } from 'esbuild';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAIT_FILES, matchBait } from './urls.js';

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, 'index.js');
const baits = join(root, 'baits');
const VIRTUAL = '\0filter-check';
const PACKAGE = 'decoy-duck';

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

export function resolveOutDir(projectRoot, outDir) {
  return isAbsolute(outDir) ? outDir : resolve(projectRoot, outDir);
}

function serveBaits(base, req, res, next) {
  const rel = matchBait(req.url, base);
  if (!rel) {
    next();
    return;
  }

  const file = join(baits, rel);
  if (!existsSync(file)) {
    next();
    return;
  }

  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(res);
}

export function copyBaits(targetDir) {
  for (const rel of Object.values(BAIT_FILES)) {
    const source = join(baits, rel);
    const dest = join(targetDir, rel);
    if (existsSync(dest)) {
      const same = readFileSync(source).equals(readFileSync(dest));
      if (!same) {
        throw new Error(
          `filter-check: ${dest} уже есть и отличается от bait-файла пакета. Переименуйте свой файл, иначе проверка рекламы получит не тот ответ.`,
        );
      }
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest);
  }
}

export function filterCheck() {
  let outDir = '';
  let base = '/';
  let command = 'serve';

  return {
    name: 'filter-check',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: { exclude: [PACKAGE] },
      };
    },
    configResolved(config) {
      outDir = resolveOutDir(config.root, config.build.outDir);
      base = config.base || '/';
      command = config.command;
    },
    resolveId(id) {
      if (id === PACKAGE) return VIRTUAL;
    },
    async load(id) {
      if (id !== VIRTUAL) return null;
      const result = await build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        legalComments: 'none',
      });
      return `const __filterCheckBase = ${JSON.stringify(base)};\n${result.outputFiles[0].text}`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => serveBaits(base, req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => serveBaits(base, req, res, next));
    },
    closeBundle() {
      if (command !== 'build') return;
      copyBaits(outDir);
    },
  };
}
