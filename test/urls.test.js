import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyBase, matchBait, publicBase, stripBase } from '../src/filter-check/urls.js';
import { resolveOutDir } from '../src/filter-check/vite.js';

describe('resolveOutDir', () => {
  it('считает относительный outDir от root, а не от процесса', () => {
    assert.equal(resolveOutDir('/repo/app', 'dist'), '/repo/app/dist');
  });

  it('оставляет абсолютный outDir как есть', () => {
    assert.equal(resolveOutDir('/repo/app', '/tmp/out'), '/tmp/out');
  });
});

describe('applyBase', () => {
  it('добавляет base к своим bait-путям', () => {
    assert.equal(applyBase('/app/', '/ad_header.js'), '/app/ad_header.js');
    assert.equal(applyBase('/app', '/ads/images/pixel.png'), '/app/ads/images/pixel.png');
  });

  it('не трогает корень и чужой хост', () => {
    assert.equal(applyBase('/', '/ad_header.js'), '/ad_header.js');
    assert.equal(
      applyBase('/app/', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    );
  });
});

describe('matchBait', () => {
  it('находит файл и с base, и без него, отбрасывая query', () => {
    assert.equal(matchBait('/ad_header.js?t=1'), 'ad_header.js');
    assert.equal(matchBait('/app/ads/images/pixel.png?t=2', '/app/'), 'ads/images/pixel.png');
    assert.equal(stripBase('/app/assets/ctrl.js', '/app/'), '/assets/ctrl.js');
  });

  it('не принимает посторонний путь', () => {
    assert.equal(matchBait('/app/index.html', '/app/'), null);
  });
});

describe('publicBase', () => {
  it('вне Vite возвращает корень', () => {
    assert.equal(publicBase(), '/');
  });
});
