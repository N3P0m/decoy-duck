const KNOWN = new Set(['blocked', 'clear', 'inconclusive', 'skipped']);

function read(signals, key) {
  const value = signals?.[key];
  return KNOWN.has(value) ? value : 'inconclusive';
}

/**
 * Сводит четыре статуса проб в вердикт. Чистая функция, без DOM.
 *
 * @param {{ cosmetic?: string, script?: string, image?: string, thirdParty?: string }} signals
 *   Каждый статус: `blocked`, `clear` или `inconclusive`.
 * @returns {{
 *   detected: boolean | null,
 *   status: 'active' | 'inactive' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   probability: number,
 * }} `probability` — вероятность, что фильтр включён, от 0 до 100.
 */
export function decide(signals) {
  const cosmetic = read(signals, 'cosmetic');
  const script = read(signals, 'script');
  const image = read(signals, 'image');
  const thirdParty = read(signals, 'thirdParty');

  if (script === 'blocked' || image === 'blocked') {
    const both = script === 'blocked' && image === 'blocked';
    return { detected: true, status: 'active', confidence: 'high', probability: both ? 98 : 90 };
  }

  if (cosmetic === 'blocked' && thirdParty === 'blocked') {
    return { detected: true, status: 'active', confidence: 'high', probability: 85 };
  }

  if (cosmetic === 'blocked') {
    return { detected: true, status: 'active', confidence: 'medium', probability: 60 };
  }

  if (
    thirdParty === 'blocked' &&
    cosmetic === 'clear' &&
    script === 'clear' &&
    image === 'clear'
  ) {
    return { detected: true, status: 'active', confidence: 'medium', probability: 40 };
  }

  const thirdPartyClear = thirdParty === 'clear' || thirdParty === 'skipped';

  if (
    cosmetic === 'clear' &&
    script === 'clear' &&
    image === 'clear' &&
    thirdPartyClear
  ) {
    return { detected: false, status: 'inactive', confidence: 'high', probability: 5 };
  }

  return { detected: null, status: 'unknown', confidence: 'low', probability: 50 };
}
