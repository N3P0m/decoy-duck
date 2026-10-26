import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interpretPair } from '../src/filter-check/probes/resource.js';
import { decide } from '../src/filter-check/verdict.js';

const clear = {
  cosmetic: 'clear',
  script: 'clear',
  image: 'clear',
  thirdParty: 'clear',
};

describe('decide', () => {
  it('считает свой скрипт достаточным признаком', () => {
    assert.deepEqual(decide({ ...clear, script: 'blocked' }), {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 90,
    });
  });

  it('считает свою картинку достаточным признаком', () => {
    assert.deepEqual(decide({ ...clear, image: 'blocked', cosmetic: 'inconclusive' }), {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 90,
    });
  });

  it('поднимает вероятность, когда закрыты и скрипт, и картинка', () => {
    assert.deepEqual(decide({ ...clear, script: 'blocked', image: 'blocked' }), {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 98,
    });
  });

  it('повышает уверенность, когда совпали косметика и чужой хост', () => {
    assert.deepEqual(decide({ ...clear, cosmetic: 'blocked', thirdParty: 'blocked' }), {
      detected: true,
      status: 'active',
      confidence: 'high',
      probability: 85,
    });
  });

  it('оставляет среднюю уверенность на одной косметике', () => {
    assert.deepEqual(decide({
      cosmetic: 'blocked',
      script: 'clear',
      image: 'inconclusive',
      thirdParty: 'clear',
    }), {
      detected: true,
      status: 'active',
      confidence: 'medium',
      probability: 60,
    });
  });

  it('оставляет среднюю уверенность на одном чужом хосте', () => {
    assert.deepEqual(decide({ ...clear, thirdParty: 'blocked' }), {
      detected: true,
      status: 'active',
      confidence: 'medium',
      probability: 40,
    });
  });

  it('не считает чужой хост блоком, если свои пробы не ответили', () => {
    assert.deepEqual(decide({
      cosmetic: 'inconclusive',
      script: 'clear',
      image: 'clear',
      thirdParty: 'blocked',
    }), {
      detected: null,
      status: 'unknown',
      confidence: 'low',
      probability: 50,
    });
  });

  it('не видит фильтр, когда все пробы открылись', () => {
    assert.deepEqual(decide(clear), {
      detected: false,
      status: 'inactive',
      confidence: 'high',
      probability: 5,
    });
  });

  it('возвращает unknown, если ни одна проба не ответила', () => {
    assert.deepEqual(decide({
      cosmetic: 'inconclusive',
      script: 'inconclusive',
      image: 'inconclusive',
      thirdParty: 'inconclusive',
    }), {
      detected: null,
      status: 'unknown',
      confidence: 'low',
      probability: 50,
    });
  });

  it('не поднимает чужой хост до active, если контроль сети сомнителен', () => {
    assert.deepEqual(decide({
      cosmetic: 'clear',
      script: 'inconclusive',
      image: 'clear',
      thirdParty: 'blocked',
    }), {
      detected: null,
      status: 'unknown',
      confidence: 'low',
      probability: 50,
    });
  });

  it('считает страницу чистой, если сторонняя проба выключена', () => {
    assert.deepEqual(decide({ ...clear, thirdParty: 'skipped' }), {
      detected: false,
      status: 'inactive',
      confidence: 'high',
      probability: 5,
    });
  });
});

describe('interpretPair', () => {
  it('считает блок, когда контроль выполнился, а bait — нет', () => {
    assert.equal(interpretPair('loaded', 'error'), 'blocked');
    assert.equal(interpretPair('loaded', 'timeout'), 'blocked');
    assert.equal(interpretPair('loaded', 'empty'), 'blocked');
  });

  it('считает пробу чистой, когда выполнились оба файла', () => {
    assert.equal(interpretPair('loaded', 'loaded'), 'clear');
  });

  it('не делает вывод, если контроль сам не выполнился', () => {
    assert.equal(interpretPair('error', 'error'), 'inconclusive');
    assert.equal(interpretPair('timeout', 'loaded'), 'inconclusive');
    assert.equal(interpretPair('aborted', 'error'), 'inconclusive');
  });
});
