# decoy-duck

Проверка фильтра рекламы в браузере. Четыре пробы сводятся в вердикт с уровнем уверенности. Bait-файлы отдаёт Vite-плагин: в dev-сервере и в каталог сборки. В бандл приложения они не попадают, потому что фильтр смотрит на URL запроса.

## Установка

```
npm install decoy-duck
```

Пакет публичный, отдельный registry не нужен.

## Подключение

```js
import { defineConfig } from 'vite'
import { filterCheck } from 'decoy-duck/vite'

export default defineConfig({
  plugins: [filterCheck()],
})
```

```js
import { detectAdblock, defaultBait } from 'decoy-duck'

const result = await detectAdblock()
```

Плагин в dev отдаёт bait по адресам из `defaultBait` с учётом Vite `base` и при `vite build` копирует их в `build.outDir`. Этот каталог считается от `root` конфига, а не от текущей папки процесса. Файлы остаются в корне выходного каталога: `base` — это префикс URL, а не вложенная папка.

Импорт пакета в dev собирается в виртуальный модуль с нейтральным id: иначе Vite запросил бы файл из `node_modules/decoy-duck/`, и блокировщик мог бы вырезать сам детектор.

`npm run dev` в этом репозитории проверяет тот же публичный вход.

Свои адреса, отмена и отказ от чужого хоста:

```js
const controller = new AbortController()

detectAdblock({
  timeout: 2500,
  signal: controller.signal,
  thirdParty: false,
  bait: { ...defaultBait },
})
```

`thirdParty: false` не отправляет запрос к рекламному хосту. Пустые свои пути с ведущим `/` получают `base`, абсолютные `https://` — нет.

## Сторонняя проба

По умолчанию проверка один раз запрашивает `pagead2.googlesyndication.com`. Cookies и referrer не уходят, но хост видит IP и User-Agent. Скрипт Google при этом не выполняется.

Обрыв этого запроса — не доказательство фильтра. Так же выглядят CSP, корпоративный прокси, сбой DNS и недоступность самого хоста. Поэтому одна только сторонняя проба даёт `active` со средней уверенностью. Высокую уверенность дают заблокированные скрипт или картинка на своём домене.

## Результат

`detected` равен `true`, только если статус `active`. `false` — фильтр не найден. `null` — часть проб не ответила, вывода нет.

```js
{
  detected: true,
  status: 'active',      // active | inactive | unknown
  confidence: 'high',    // high | medium | low
  signals: {
    cosmetic: 'clear',   // blocked | clear | inconclusive
    script: 'blocked',
    image: 'clear',
    thirdParty: 'clear',
  },
  elapsedMs: 1040,
}
```

Плагин кладёт на сайт:

- `/ad_header.js`
- `/assets/ctrl.js`
- `/assets/pixel.png`
- `/ads/images/pixel.png`

## Как читается вердикт

Четыре пробы стартуют параллельно. У скрипта и картинки есть нейтральный контроль. Если не открылся и он, проба остаётся `inconclusive`.

- Заблокированный скрипт или картинка на своём домене — `active`, уверенность высокая.
- Вместе скрытый элемент и недоступный сторонний рекламный хост — `active`, уверенность высокая.
- Только скрытый элемент — `active`, уверенность средняя.
- Только сторонний хост, а остальные пробы открылись — `active`, уверенность средняя. Это «рекламный хост недоступен»: фильтр, прокси, DNS или сам хост.
- Все свои пробы открылись, а сторонняя выключена (`skipped`) или тоже открылась — `inactive`, уверенность высокая.
- Иначе — `unknown`.

`decide(signals)` — чистая функция того же правила. Типы лежат рядом с входом пакета. Проверка без браузера: `npm test`.

## Публикация

Пакет публичный, без scope. Репозиторий: `github.com/N3P0m/decoy-duck`. В npm его отправляет GitHub Actions по тегу `v*`, файл `.github/workflows/publish.yml`. Версия в теге должна совпасть с `version` в `package.json`: тег `v0.1.0` публикует `0.1.0`. Перед отправкой `prepublishOnly` запускает тесты.

Первый выпуск не может пройти только через trusted publishing: страница настроек пакета появляется после того, как имя уже есть в реестре. Для `0.1.0` положите в секрет репозитория `NPM_TOKEN` — granular access token с правом публикации. Workflow возьмёт его, если trusted publisher ещё не настроен.

После первого выпуска на npmjs.com откройте пакет → Settings → Trusted Publisher → GitHub Actions и укажите:

- Organization or user: `N3P0m`
- Repository: `decoy-duck`
- Workflow filename: `publish.yml`
- Разрешите прямую публикацию через `npm publish`. Новые настройки по умолчанию пускают только `npm stage publish`.

Поле `repository.url` в `package.json` должно остаться `git+https://github.com/N3P0m/decoy-duck.git`: npm сверяет его с репозиторием, из которого пришёл OIDC-токен. Репозиторий должен быть публичным, иначе provenance не появится. Дальше секрет `NPM_TOKEN` можно удалить: публикация пойдёт по короткому OIDC-токену.
