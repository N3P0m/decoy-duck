import { detectAdblock, defaultBait, decide } from '../src/filter-check/index.js';
import { filterCheck } from '../src/filter-check/vite.js';

const plugin: { name: string } = filterCheck();
void plugin.name;

const bait: typeof defaultBait = defaultBait;

const verdict: { detected: boolean | null; status: string; confidence: string; probability: number } = decide({
  cosmetic: 'clear',
  script: 'clear',
  image: 'clear',
  thirdParty: 'skipped',
});

const run: Promise<{ detected: boolean | null }> = detectAdblock({
  timeout: 1000,
  thirdParty: false,
  bait,
});

void verdict;
void run;
