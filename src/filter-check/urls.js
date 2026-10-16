export const BAIT_FILES = {
  '/ad_header.js': 'ad_header.js',
  '/assets/ctrl.js': 'assets/ctrl.js',
  '/assets/pixel.png': 'assets/pixel.png',
  '/ads/images/pixel.png': 'ads/images/pixel.png',
};

export function applyBase(base, url) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  if (!base || base === '/') return url;
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${url}`;
}

export function publicBase() {
  if (typeof __filterCheckBase === 'string' && __filterCheckBase) return __filterCheckBase;
  const env = import.meta.env;
  if (!env) return '/';
  const base = env.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

export function stripBase(pathname, base) {
  if (!base || base === '/' || base === './') return pathname;
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

export function matchBait(url = '', base = '/') {
  const pathname = stripBase(url.split('?')[0], base);
  return BAIT_FILES[pathname] ?? null;
}
