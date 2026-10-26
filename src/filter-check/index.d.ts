export type ProbeStatus = 'blocked' | 'clear' | 'inconclusive' | 'skipped';
export type DetectStatus = 'active' | 'inactive' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export interface BaitUrls {
  scriptUrl: string;
  imageUrl: string;
  controlScriptUrl: string;
  controlImageUrl: string;
  thirdPartyUrl: string;
}

export interface DetectSignals {
  cosmetic: ProbeStatus;
  script: ProbeStatus;
  image: ProbeStatus;
  thirdParty: ProbeStatus;
}

export interface DetectResult {
  detected: boolean | null;
  status: DetectStatus;
  confidence: Confidence;
  /** Вероятность, что фильтр включён, от 0 до 100. */
  probability: number;
  signals: DetectSignals;
  elapsedMs: number;
}

export interface DetectOptions {
  /** Таймаут сетевых проб, мс. По умолчанию 2500. */
  timeout?: number;
  /** Отмена проверки. */
  signal?: AbortSignal;
  /** Свои URL вместо `defaultBait`. Путь с `/` уходит как написан. Префикс Vite `base` добавляет только плагин `filterCheck`. */
  bait?: Partial<BaitUrls>;
  /**
   * Запрос к стороннему рекламному хосту.
   * По умолчанию включён. `false` не отправляет его: хост узнаёт IP и User-Agent,
   * а обрыв запроса бывает и без фильтра.
   */
  thirdParty?: boolean;
}

export declare const defaultBait: BaitUrls;

export declare function detectAdblock(options?: DetectOptions): Promise<DetectResult>;

export declare function decide(
  signals: Partial<DetectSignals>,
): Pick<DetectResult, 'detected' | 'status' | 'confidence' | 'probability'>;
