const BAIT_CLASS = 'square-ad sticky-ad sponsored-ad static-ad';
const CHECK_DELAYS = [100, 400];
const SETTLE_DELAY = 1000;

function isCollapsed(el) {
  if (!el.isConnected) return true;
  if (el.offsetHeight === 0 || el.offsetWidth === 0) return true;

  const style = getComputedStyle(el);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  if (el.getClientRects().length === 0) return true;

  return false;
}

export function probeCosmetic({ signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted || !document.body) {
      resolve({ status: 'inconclusive' });
      return;
    }

    const el = document.createElement('div');
    el.className = BAIT_CLASS;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;pointer-events:none;';
    document.body.appendChild(el);

    let settled = false;
    const timers = [];
    const observer = new MutationObserver(() => {
      if (isCollapsed(el)) finish('blocked');
    });

    const finish = (status) => {
      if (settled) return;
      settled = true;
      for (const id of timers) clearTimeout(id);
      observer.disconnect();
      signal?.removeEventListener('abort', onAbort);
      el.remove();
      resolve({ status });
    };

    const onAbort = () => finish('inconclusive');

    const check = () => {
      if (isCollapsed(el)) finish('blocked');
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    observer.observe(el, { attributes: true });
    observer.observe(document.body, { childList: true });

    check();
    if (settled) return;

    requestAnimationFrame(() => {
      if (settled) return;
      requestAnimationFrame(() => {
        if (!settled) check();
      });
    });

    for (const delay of CHECK_DELAYS) {
      timers.push(setTimeout(check, delay));
    }

    timers.push(setTimeout(() => {
      if (settled) return;
      if (isCollapsed(el)) finish('blocked');
      else finish('clear');
    }, SETTLE_DELAY));
  });
}
