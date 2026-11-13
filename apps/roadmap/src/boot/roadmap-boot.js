/*
 * Roadmap boot script: an async, same-origin, hashed asset in <head>. It
 * needs no inline-script hash in the CSP, never blocks rendering, and at
 * ~2 KB runs as soon as it arrives, before the stylesheet allows a paint.
 * See src/defer-hydration.ts and src/lite-mode.ts for the contract.
 *
 * 1. Lite mode: mark html[data-lite] before the first paint on devices with
 *    four or fewer cores, 4 GB or less of memory, or Data Saver.
 * 2. Hydration loader: on the first pointerdown, touchstart, keydown or
 *    focusin, or in an idle period within 1 s of the largest contentful
 *    paint (4 s at the latest), turn the inert roadmap-modulepreload hints
 *    into modulepreload links (the fetch starts), then import the entry one
 *    frame later so the tap that started it paints first.
 * 3. First tap: a click on a button that React has not hydrated yet is held
 *    (stopped, so React never sees it twice), shown as pressed at once, and
 *    clicked again as soon as React has attached that button's props. Links
 *    and <summary> keep their native behaviour.
 */
(function () {
  var root = document.documentElement;
  try {
    var nav = navigator;
    var cores = nav.hardwareConcurrency;
    var memory = nav.deviceMemory;
    if (
      (cores && cores <= 4) ||
      (memory && memory <= 4) ||
      (nav.connection && nav.connection.saveData)
    )
      root.setAttribute('data-lite', '');
  } catch (error) {}

  var INTENTS = ['pointerdown', 'touchstart', 'keydown', 'focusin'];
  var IDLE_TIMEOUT_MS = 1000;
  var FALLBACK_MS = 4000;
  var PENDING = 'data-roadmap-pending';
  var options = { capture: true, passive: true };
  var started = false;
  var pending = null;

  function hydrated(element) {
    return Object.keys(element).some(function (key) {
      return key.indexOf('__reactProps') === 0;
    });
  }

  function whenParsed(run) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  function replay() {
    var frames = 0;
    function tick() {
      var button = pending;
      if (!button || !button.isConnected) return;
      if (hydrated(button)) {
        pending = null;
        button.removeAttribute(PENDING);
        button.click();
        return;
      }
      frames += 1;
      if (frames < 600) requestAnimationFrame(tick);
    }
    tick();
  }

  function importEntry() {
    var entry = document.querySelector('script[data-roadmap-entry]');
    if (entry) import(entry.getAttribute('src')).then(replay, function () {});
  }

  function start() {
    if (started) return;
    started = true;
    for (var i = 0; i < INTENTS.length; i += 1)
      removeEventListener(INTENTS[i], start, options);
    whenParsed(function () {
      var hints = document.querySelectorAll(
        'link[rel="roadmap-modulepreload"]'
      );
      for (var j = 0; j < hints.length; j += 1) {
        var link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = hints[j].getAttribute('href');
        document.head.append(link);
      }
      requestAnimationFrame(function () {
        setTimeout(importEntry, 0);
      });
    });
  }

  /** Show the held tap at once: a pending state, and a pressed toggle. */
  function hold(button) {
    pending = button;
    button.setAttribute(PENDING, '');
    if (!button.hasAttribute('aria-pressed')) return;
    var group = button.parentNode ? button.parentNode.children : [];
    for (var i = 0; i < group.length; i += 1)
      if (group[i] !== button && group[i].hasAttribute('aria-pressed'))
        group[i].setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
  }

  for (var k = 0; k < INTENTS.length; k += 1)
    addEventListener(INTENTS[k], start, options);
  addEventListener(
    'click',
    function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('button') : null;
      if (!button || hydrated(button)) return;
      hold(button);
      event.stopImmediatePropagation();
      start();
      replay();
    },
    true
  );

  function idle() {
    (
      window.requestIdleCallback ||
      function (run) {
        return setTimeout(run, 1);
      }
    )(start, { timeout: IDLE_TIMEOUT_MS });
  }
  try {
    var types = PerformanceObserver.supportedEntryTypes || [];
    new PerformanceObserver(function (list, observer) {
      observer.disconnect();
      idle();
    }).observe({
      type:
        types.indexOf('largest-contentful-paint') >= 0
          ? 'largest-contentful-paint'
          : 'paint',
      buffered: true,
    });
  } catch (error) {
    idle();
  }
  setTimeout(start, FALLBACK_MS);
})();
