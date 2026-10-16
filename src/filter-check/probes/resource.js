const CONTROL_FLAG = '__ctl';
const BAIT_FLAG = '__hdr';

function withCacheBust(url) {
  const glue = url.includes('?') ? '&' : '?';
  return `${url}${glue}t=${Date.now()}`;
}

function loadScript(url, flag, timeout, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted || !document.head) {
      resolve('aborted');
      return;
    }

    const script = document.createElement('script');
    let settled = false;
    const timer = setTimeout(() => finish('timeout'), timeout);

    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const glue = url.includes('?') ? '&' : '?';
    const bag = `${flag}Bag`;

    const dropToken = () => {
      const store = globalThis[bag];
      if (!store) return;
      delete store[token];
      if (Object.keys(store).length === 0) delete globalThis[bag];
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      script.onload = null;
      script.onerror = null;
      script.remove();
      dropToken();
      resolve(result);
    };

    const onAbort = () => finish('aborted');
    script.onload = () => finish(globalThis[bag]?.[token] === 1 ? 'loaded' : 'empty');
    script.onerror = () => finish('error');
    script.async = true;
    script.src = `${url}${glue}t=${token}`;
    signal?.addEventListener('abort', onAbort, { once: true });
    document.head.appendChild(script);
  });
}

function loadImage(url, timeout, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve('aborted');
      return;
    }

    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => finish('timeout'), timeout);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    const onAbort = () => finish('aborted');

    img.onload = () => finish(img.naturalWidth > 0 ? 'loaded' : 'empty');
    img.onerror = () => finish('error');
    signal?.addEventListener('abort', onAbort, { once: true });
    img.src = withCacheBust(url);
  });
}

export function interpretPair(control, bait) {
  if (control === 'loaded' && (bait === 'error' || bait === 'timeout' || bait === 'empty')) {
    return 'blocked';
  }
  if (control === 'loaded' && bait === 'loaded') return 'clear';
  return 'inconclusive';
}

export function probeScriptPair({ controlUrl, baitUrl, timeout, signal }) {
  return Promise.all([
    loadScript(controlUrl, CONTROL_FLAG, timeout, signal),
    loadScript(baitUrl, BAIT_FLAG, timeout, signal),
  ]).then(([control, bait]) => ({
    status: interpretPair(control, bait),
    control,
    bait,
  }));
}

export function probeImagePair({ controlUrl, baitUrl, timeout, signal }) {
  return Promise.all([
    loadImage(controlUrl, timeout, signal),
    loadImage(baitUrl, timeout, signal),
  ]).then(([control, bait]) => ({
    status: interpretPair(control, bait),
    control,
    bait,
  }));
}

export function probeThirdParty({ url, timeout, signal }) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve('aborted');
      return;
    }

    const controller = new AbortController();
    let aborted = false;
    const timer = setTimeout(() => controller.abort(), timeout);

    const onAbort = () => {
      aborted = true;
      controller.abort();
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    }).then(
      () => finish('ok'),
      () => finish(aborted || signal?.aborted ? 'aborted' : 'failed'),
    );
  });
}
