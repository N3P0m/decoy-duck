(function () {
  try {
    var src = document.currentScript && document.currentScript.src;
    if (!src) return;
    var token = new URL(src).searchParams.get('t');
    if (!token) return;
    var bag = globalThis.__hdrBag || (globalThis.__hdrBag = Object.create(null));
    bag[token] = 1;
  } catch (e) {}
})();
