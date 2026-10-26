import './styles.css';
import { detectAdblock } from 'decoy-duck';

const PROBES = [
  {
    key: 'cosmetic',
    title: 'Косметический фильтр',
    hint: 'Элемент с классами из EasyList: square-ad, sticky-ad, sponsored-ad, static-ad.',
  },
  {
    key: 'script',
    title: 'Скрипт на этом сайте',
    hint: 'Путь /ad_header.js есть в сетевых правилах EasyList. Рядом грузится нейтральный контроль.',
  },
  {
    key: 'image',
    title: 'Картинка на этом сайте',
    hint: 'Путь /ads/images/pixel.png есть в правилах EasyList для изображений.',
  },
  {
    key: 'thirdParty',
    title: 'Сторонний рекламный хост',
    hint: 'Запрос к pagead2.googlesyndication.com раскрывает этому хосту IP и User-Agent. Обрыв бывает и без фильтра: прокси, DNS, CSP или сам хост недоступен.',
  },
];

const HEADLINE = {
  pending: 'Проверяем',
  active: {
    high: 'Блокировщик рекламы включён',
    medium: 'Блокировщик рекламы, скорее всего, включён',
  },
  inactive: {
    high: 'Блокировщик рекламы не обнаружен',
  },
  unknown: {
    low: 'Не удалось определить',
  },
};

const LABEL = {
  pending: 'проверяем',
  blocked: 'заблокировано',
  clear: 'доступно',
  inconclusive: 'нет данных',
};

const CONFIDENCE = {
  high: 'высокая',
  medium: 'средняя',
  low: 'низкая',
};

const summary = document.querySelector('#summary');
const stateEl = document.querySelector('#state');
const detailEl = document.querySelector('#detail');
const grid = document.querySelector('#grid');
const retry = document.querySelector('#retry');

function formatElapsed(ms) {
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
}

function explain(result) {
  const confidence = `Вероятность ${result.probability}%, уверенность ${CONFIDENCE[result.confidence]}.`;
  const elapsed = `Проверка заняла ${formatElapsed(result.elapsedMs)}.`;
  const { cosmetic, script, image, thirdParty } = result.signals;

  if (result.status === 'unknown') {
    return `${confidence} ${elapsed} Часть проб не ответила. Откройте страницу через локальный сервер.`;
  }

  if (result.status === 'inactive') {
    return `${confidence} ${elapsed} Все четыре пробы открылись.`;
  }

  if (script === 'blocked' || image === 'blocked') {
    return `${confidence} ${elapsed} Фильтр оборвал файл на этом же сайте.`;
  }

  if (cosmetic === 'blocked' && thirdParty === 'blocked') {
    return `${confidence} ${elapsed} Скрыт пробный элемент и оборван сторонний рекламный хост.`;
  }

  if (cosmetic === 'blocked') {
    return `${confidence} ${elapsed} Скрыт пробный элемент. Сетевые пробы при этом открылись.`;
  }

  if (thirdParty === 'blocked') {
    return `${confidence} ${elapsed} Файлы этого сайта открылись. Сторонний рекламный хост недоступен: так бывает при DNS-фильтре и при недоступности самого хоста.`;
  }

  return `${confidence} ${elapsed}`;
}

function renderProbes(signals) {
  grid.replaceChildren();

  for (const probe of PROBES) {
    const status = signals?.[probe.key] ?? 'pending';
    const tile = document.createElement('article');
    tile.className = 'tile';
    tile.dataset.state = status;

    const title = document.createElement('h2');
    title.className = 'tile-title';
    title.textContent = probe.title;

    const label = document.createElement('p');
    label.className = 'tile-label';
    label.textContent = LABEL[status] ?? LABEL.inconclusive;

    const hint = document.createElement('p');
    hint.className = 'tile-hint';
    hint.textContent = probe.hint;

    tile.append(title, label, hint);
    grid.append(tile);
  }
}

function paint(result) {
  summary.dataset.state = result.status;
  stateEl.textContent = HEADLINE[result.status]?.[result.confidence] ?? HEADLINE.unknown.low;
  detailEl.textContent = explain(result);
  renderProbes(result.signals);
}

async function run() {
  retry.disabled = true;
  summary.dataset.state = 'pending';
  stateEl.textContent = HEADLINE.pending;
  detailEl.textContent = 'Четыре пробы идут параллельно.';
  renderProbes(null);

  try {
    paint(await detectAdblock());
  } catch {
    summary.dataset.state = 'unknown';
    stateEl.textContent = HEADLINE.unknown.low;
    detailEl.textContent = 'Проверка прервалась до вердикта.';
    renderProbes(null);
  } finally {
    retry.disabled = false;
  }
}

retry.addEventListener('click', () => {
  run();
});

renderProbes(null);
run();
