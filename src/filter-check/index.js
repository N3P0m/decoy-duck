/**
 * Проверка фильтра рекламы.
 *
 * Файлы-приманки должны запрашиваться браузером по своим URL, их нельзя класть в бандл.
 * Путь с ведущим `/` уходит как написан. Префикс Vite `base` добавляет только `filterCheck` из `decoy-duck/vite`.
 * Установка описана в корневом README пакета.
 */

export { defaultBait, detectAdblock } from './detect.js';
export { decide } from './verdict.js';
