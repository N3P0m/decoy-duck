/**
 * Проверка фильтра рекламы.
 *
 * В проекте на Vite подключите `filterCheck` из `decoy-duck/vite`:
 * bait-файлы нельзя класть в бандл, их URL должен увидеть фильтр.
 * Установка и публикация описаны в корневом README пакета.
 */

export { defaultBait, detectAdblock } from './detect.js';
export { decide } from './verdict.js';
