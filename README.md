[English](README.md) · [Русский](README.ru.md)

# decoy-duck

Detects whether a browser ad filter is on. Four probes collapse into a verdict with a confidence level.

The filter looks at the request URL. Four bait files sit on the site as ordinary static files and the browser requests them at known paths. They are not part of the application bundle.

## Install

```
npm install decoy-duck
```

The package is public. No custom registry is required. Package page: [decoy-duck](https://www.npmjs.com/package/decoy-duck).

## Setup

Two steps: call the check and place the bait files at the site root.

```js
import { detectAdblock } from 'decoy-duck'

const result = await detectAdblock()
```

Copy the files from `node_modules/decoy-duck/src/filter-check/baits/` into the build output directory. Keep these names:

| File in the package | URL on the site |
|---|---|
| `ad_header.js` | `/ad_header.js` |
| `assets/ctrl.js` | `/assets/ctrl.js` |
| `assets/pixel.png` | `/assets/pixel.png` |
| `ads/images/pixel.png` | `/ads/images/pixel.png` |

A hash in the filename changes the URL, and the filter rule no longer matches it.

Webpack does this with `copy-webpack-plugin`:

```js
import CopyPlugin from 'copy-webpack-plugin'

export default {
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'node_modules/decoy-duck/src/filter-check/baits/ad_header.js', to: 'ad_header.js' },
        { from: 'node_modules/decoy-duck/src/filter-check/baits/assets/ctrl.js', to: 'assets/ctrl.js' },
        { from: 'node_modules/decoy-duck/src/filter-check/baits/assets/pixel.png', to: 'assets/pixel.png' },
        { from: 'node_modules/decoy-duck/src/filter-check/baits/ads/images/pixel.png', to: 'ads/images/pixel.png' },
      ],
    }),
  ],
}
```

Leave these four files as static assets. Importing them into your module pulls their contents into the bundle: the browser never requests the expected URL, and the filter sees nothing.

A site at the domain root needs no extra URLs. If the page is served from `/app/`, the files live at `/app/ad_header.js` and the other three paths, and the check receives those URLs explicitly:

```js
import { detectAdblock, defaultBait } from 'decoy-duck'

const result = await detectAdblock({
  bait: {
    ...defaultBait,
    scriptUrl: '/app/ad_header.js',
    imageUrl: '/app/ads/images/pixel.png',
    controlScriptUrl: '/app/assets/ctrl.js',
    controlImageUrl: '/app/assets/pixel.png',
  },
})
```

Without the plugin, a path that starts with `/` is requested exactly as written in `bait`. The Vite plugin prefixes such a path with `base`. An absolute `https://` URL is passed through unchanged in both cases.

## Result

`detected` is `true` only when the status is `active`. `false` means no filter was found. `null` means some probes did not answer, so there is no conclusion.

```js
{
  detected: true,
  status: 'active',      // active | inactive | unknown
  confidence: 'high',    // high | medium | low
  probability: 90,       // 0–100, chance the filter is on
  signals: {
    cosmetic: 'clear',   // blocked | clear | inconclusive
    script: 'blocked',
    image: 'clear',
    thirdParty: 'clear', // blocked | clear | inconclusive | skipped
  },
  elapsedMs: 1040,
}
```

The four probes start in parallel. The script and the image each have a neutral control. If the control also fails to load, the probe stays `inconclusive`.

- A blocked script or image on your own domain means `active`, high confidence.
- A hidden element together with an unreachable third-party ad host means `active`, high confidence.
- A hidden element alone means `active`, medium confidence.
- A third-party host alone, while the other probes loaded, means `active`, medium confidence. That signal is "the ad host is unreachable": a filter, a proxy, DNS, or the host itself.
- Your own probes loaded, and the third-party probe is off (`skipped`) or also loaded, means `inactive`, high confidence.
- Anything else is `unknown`.

`probability` is the chance the filter is on, from 0 to 100:

- both same-origin files are blocked — 98
- one of them is blocked — 90
- the element is hidden and the third-party host is unreachable — 85
- only the element is hidden — 60
- only the third-party host is unreachable — 40
- the same-origin probes loaded — 5
- there is no conclusion — 50

`decide(signals)` is a pure function of the same rule. Types ship next to the package entry.

## Options

```js
import { detectAdblock, defaultBait } from 'decoy-duck'

const controller = new AbortController()

const result = await detectAdblock({
  timeout: 2500,
  signal: controller.signal,
  thirdParty: false,
  bait: { ...defaultBait },
})
```

`timeout` is the limit for network probes in milliseconds. The default is 2500. `signal` cancels the check.

`thirdParty: false` skips the request to the ad host. By default the check requests `pagead2.googlesyndication.com` once. Cookies and the referrer are not sent, but the host sees the IP and the User-Agent. The Google script itself does not run.

A dropped request is not proof of a filter. A CSP, a corporate proxy, a DNS failure, and the host being down look the same. A third-party probe on its own therefore yields `active` at medium confidence. High confidence comes from a blocked script or image on your own domain.

## Vite

On a Vite project the same four files can be laid out by the plugin. This path is optional: the check is still called through `detectAdblock()`.

```js
import { defineConfig } from 'vite'
import { filterCheck } from 'decoy-duck/vite'

export default defineConfig({
  plugins: [filterCheck()],
})
```

In dev the plugin serves the files at the `defaultBait` URLs, including the Vite `base`. On `vite build` it copies them into `build.outDir`. That directory is resolved from the config `root`, not from the process working directory. The files stay at the root of the output directory: `base` is a URL prefix, not a nested folder. Your own `bait` paths that start with `/` receive that prefix automatically.

In dev, importing the package is compiled to a virtual module with a neutral id. Otherwise Vite would request a file from `node_modules/decoy-duck/`, and a blocker could strip the detector itself.

If a file at the same path is already in the output directory and the bytes differ, the build stops and does not overwrite it.

## Developing this repository

Check without a browser: `npm test`.

Browser run against live extensions: `npm run test:browser`. It does not open a window. To watch the demo on screen, one extension at a time: `HEADED=1 npm run test:browser`. That run is not part of `npm test` and does not run before publish. Playwright downloads Chromium. The script downloads extension builds into `.cache/extensions`. The page opens as `localtest.me`, not `localhost`: filter lists leave the local host alone.

The run currently covers plain Chromium, uBlock Origin Lite (optimal and complete modes), AdGuard, [Adblock Plus](https://adblockplus.org/), and Ghostery. The full uBlock Origin release is still Manifest V2, and Chromium does not load it.

`npm run dev` in this repository opens the demo through the same public entry and the Vite plugin.

## Publishing

The package is public and unscoped. Repository: `github.com/N3P0m/decoy-duck`. Later versions are sent by GitHub Actions on a `v*` tag, workflow `.github/workflows/publish.yml`. The version in the tag must match `version` in `package.json`. Before upload, `prepublishOnly` runs the tests.

The first publish of a name that is not on the registry yet is done locally: `npm login`, then `npm publish`. npm asks for the 2FA code. Trusted Publishing can be configured only after the package exists, so the workflow does not use an `NPM_TOKEN` secret.

Right after the package appears on npmjs.com, open it → Settings → Trusted Publisher → GitHub Actions:

- Organization or user: `N3P0m`
- Repository: `decoy-duck`
- Workflow filename: `publish.yml`
- Leave Environment empty
- Allow direct publishing with `npm publish`. New configurations allow only `npm stage publish` by default.

The first successful publish through this publisher has to happen within 48 hours, or the configuration expires. `repository.url` in `package.json` must stay `git+https://github.com/N3P0m/decoy-duck.git`: npm compares it with the repository that produced the OIDC token. The repository must be public, or provenance is omitted.
