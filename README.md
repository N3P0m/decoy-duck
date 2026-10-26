# decoy-duck

Проверка фильтра рекламы в браузере. Четыре пробы сводятся в вердикт с уровнем уверенности.

Фильтр смотрит на URL запроса. Четыре файла-приманки лежат на сайте как обычная статика и запрашиваются браузером по известным путям. В бандл приложения они не входят.

## Установка

```
npm install decoy-duck
```

Пакет публичный, отдельный registry не нужен.

## Подключение

Два шага: вызвать проверку и положить файлы-приманки в корень сайта.

```js
import { detectAdblock } from 'decoy-duck'

const result = await detectAdblock()
```

Скопируйте файлы из `node_modules/decoy-duck/src/filter-check/baits/` в выходной каталог сборки. Имена остаются такими:

| Файл в пакете | Адрес на сайте |
|---|---|
| `ad_header.js` | `/ad_header.js` |
| `assets/ctrl.js` | `/assets/ctrl.js` |
| `assets/pixel.png` | `/assets/pixel.png` |
| `ads/images/pixel.png` | `/ads/images/pixel.png` |

Хеш в имени файла меняет URL, и правило фильтра его уже не узнает.

В Webpack это делает `copy-webpack-plugin`:

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

Эти четыре файла оставляют статикой. Импорт их в свой модуль затягивает содержимое в бандл: браузер не делает запрос по нужному URL, и фильтр ничего не видит.

Сайт из корня домена дополнительных адресов не требует. Если страница открывается из `/app/`, файлы лежат по `/app/ad_header.js` и остальным трём путям, а проверка получает эти адреса явно:

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

Без плагина путь с ведущим `/` уходит как написан в `bait`. Плагин Vite сам добавляет к такому пути `base`. Абсолютный `https://` в обоих случаях передаётся как есть.

## Результат

`detected` равен `true`, только если статус `active`. `false` — фильтр не найден. `null` — часть проб не ответила, вывода нет.

```js
{
  detected: true,
  status: 'active',      // active | inactive | unknown
  confidence: 'high',    // high | medium | low
  probability: 90,       // 0–100, вероятность что фильтр включён
  signals: {
    cosmetic: 'clear',   // blocked | clear | inconclusive
    script: 'blocked',
    image: 'clear',
    thirdParty: 'clear', // blocked | clear | inconclusive | skipped
  },
  elapsedMs: 1040,
}
```

Четыре пробы стартуют параллельно. У скрипта и картинки есть нейтральный контроль. Если не открылся и он, проба остаётся `inconclusive`.

- Заблокированный скрипт или картинка на своём домене — `active`, уверенность высокая.
- Вместе скрытый элемент и недоступный сторонний рекламный хост — `active`, уверенность высокая.
- Только скрытый элемент — `active`, уверенность средняя.
- Только сторонний хост, а остальные пробы открылись — `active`, уверенность средняя. Это «рекламный хост недоступен»: фильтр, прокси, DNS или сам хост.
- Все свои пробы открылись, а сторонняя выключена (`skipped`) или тоже открылась — `inactive`, уверенность высокая.
- Иначе — `unknown`.

`probability` — вероятность, что фильтр включён, от 0 до 100:

- оба своих файла закрыты — 98
- закрыт один из них — 90
- скрыт элемент и недоступен сторонний хост — 85
- скрыт только элемент — 60
- недоступен только сторонний хост — 40
- свои пробы открылись — 5
- вывода нет — 50

`decide(signals)` — чистая функция того же правила. Типы лежат рядом с входом пакета.

## Опции

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

`timeout` — предел сетевых проб в миллисекундах, по умолчанию 2500. `signal` отменяет проверку.

`thirdParty: false` не отправляет запрос к рекламному хосту. По умолчанию проверка один раз запрашивает `pagead2.googlesyndication.com`. Cookies и referrer не уходят, но хост видит IP и User-Agent. Скрипт Google при этом не выполняется.

Обрыв этого запроса — не доказательство фильтра. Так же выглядят CSP, корпоративный прокси, сбой DNS и недоступность самого хоста. Поэтому одна только сторонняя проба даёт `active` со средней уверенностью. Высокую уверенность дают заблокированные скрипт или картинка на своём домене.

## Vite

В проекте на Vite те же четыре файла может разложить плагин. Это необязательный путь: проверка по-прежнему вызывается через `detectAdblock()`.

```js
import { defineConfig } from 'vite'
import { filterCheck } from 'decoy-duck/vite'

export default defineConfig({
  plugins: [filterCheck()],
})
```

Плагин в dev отдаёт файлы по адресам из `defaultBait` с учётом Vite `base` и при `vite build` копирует их в `build.outDir`. Этот каталог считается от `root` конфига, а не от текущей папки процесса. Файлы остаются в корне выходного каталога: `base` — это префикс URL, а не вложенная папка. Свои пути с ведущим `/` в `bait` получают этот префикс сами.

Импорт пакета в dev собирается в виртуальный модуль с нейтральным id: иначе Vite запросил бы файл из `node_modules/decoy-duck/`, и блокировщик мог бы вырезать сам детектор.

Если файл с тем же путём уже лежит в выходном каталоге и байты отличаются, сборка останавливается и не затирает его.

## Разработка этого репозитория

Проверка без браузера: `npm test`.

Браузерный прогон с живыми расширениями: `npm run test:browser`. Окно при этом не открывается. Чтобы смотреть демо на экране, по одному расширению за раз: `HEADED=1 npm run test:browser`. Он не входит в `npm test` и перед публикацией не запускается. Chromium качает Playwright, сборки расширений — скрипт, в `.cache/extensions`. Страница открывается как `localtest.me`, а не `localhost`: списки фильтров не трогают локальный хост.

Сейчас в прогоне чистый Chromium, uBlock Origin Lite (оптимальный и полный режим), AdGuard, [Adblock Plus](https://adblockplus.org/ru/) и Ghostery. Полный uBlock Origin в текущем релизе всё ещё Manifest V2, Chromium его не загружает.

`npm run dev` в этом репозитории открывает демо через тот же публичный вход и плагин Vite.

## Публикация

Пакет публичный, без scope. Репозиторий: `github.com/N3P0m/decoy-duck`. В npm его отправляет GitHub Actions по тегу `v*`, файл `.github/workflows/publish.yml`. Версия в теге должна совпасть с `version` в `package.json`: тег `v0.1.0` публикует `0.1.0`. Перед отправкой `prepublishOnly` запускает тесты.

Первый выпуск не может пройти только через trusted publishing: страница настроек пакета появляется после того, как имя уже есть в реестре. Для `0.1.0` положите в секрет репозитория `NPM_TOKEN` — granular access token с правом публикации. Workflow возьмёт его, если trusted publisher ещё не настроен.

После первого выпуска на npmjs.com откройте пакет → Settings → Trusted Publisher → GitHub Actions и укажите:

- Organization or user: `N3P0m`
- Repository: `decoy-duck`
- Workflow filename: `publish.yml`
- Разрешите прямую публикацию через `npm publish`. Новые настройки по умолчанию пускают только `npm stage publish`.

Поле `repository.url` в `package.json` должно остаться `git+https://github.com/N3P0m/decoy-duck.git`: npm сверяет его с репозиторием, из которого пришёл OIDC-токен. Репозиторий должен быть публичным, иначе provenance не появится. Дальше секрет `NPM_TOKEN` можно удалить: публикация пойдёт по короткому OIDC-токену.
