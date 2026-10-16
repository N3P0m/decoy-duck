import type { Plugin } from 'vite';

/** Отдаёт bait-файлы в dev и копирует их в `outDir` при сборке. `outDir` считается от `config.root`, URL — от `config.base`. */
export declare function filterCheck(): Plugin;
