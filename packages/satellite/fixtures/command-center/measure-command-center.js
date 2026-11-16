// Command center interaction harness. Inject on a page that mounts the
// launcher (this fixture or a signed-in host), then:
//
//   const r = await measureCommandCenter({ samples: 20, query: 'finan' });
//
// It drives only the public UI (keyboard events and DOM), so the same file
// measures any two builds under the same procedure. Results report median and
// p95 per metric. "Cold open" is meaningful only for the first open after a
// fresh load: call measureColdOpen() once per load and aggregate separately.

(() => {
  const INPUT = '[data-slot="dialog-content"] input, [role="dialog"] input';
  const ITEM = '[cmdk-item]';
  const SELECTED = '[cmdk-item][data-selected="true"]';

  const nextPaint = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 0))
    );
  const waitFor = (predicate, timeout = 10_000) =>
    new Promise((resolve, reject) => {
      const started = performance.now();
      const tick = () => {
        const value = predicate();
        if (value) return resolve(value);
        if (performance.now() - started > timeout)
          return reject(new Error('timeout'));
        requestAnimationFrame(tick);
      };
      tick();
    });
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: !isMac,
        key: 'k',
        metaKey: isMac,
      })
    );
  const key = (target, value) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: value,
      })
    );
  const setInput = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const stats = (values) => {
    if (values.length === 0) return { median: null, n: 0, p95: null, raw: [] };
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
    return {
      median: at(0.5),
      n: sorted.length,
      p95: at(0.95),
      raw: values.map((v) => Math.round(v * 10) / 10),
    };
  };
  const open = async () => {
    const t0 = performance.now();
    shortcut();
    const input = await waitFor(() => document.querySelector(INPUT));
    await nextPaint();
    return { input, ms: performance.now() - t0 };
  };
  const close = async (input) => {
    input.focus();
    for (let i = 0; i < 3 && document.querySelector(INPUT); i += 1) {
      key(input, 'Escape');
      await nextPaint();
    }
    await waitFor(() => !document.querySelector(INPUT));
  };

  async function measureColdOpen() {
    const { input, ms } = await open();
    await close(input);
    return ms;
  }

  async function measureCommandCenter({ query = 'finan', samples = 20 } = {}) {
    const warmOpen = [];
    const search = [];
    const arrows = [];
    const remote = [];
    for (let i = 0; i < samples; i += 1) {
      const { input, ms } = await open();
      warmOpen.push(ms);

      // 5-character search: time from the last keystroke to result paint.
      const t1 = performance.now();
      for (let c = 1; c <= query.length; c += 1)
        setInput(input, query.slice(0, c));
      await waitFor(() => document.querySelector(ITEM));
      await nextPaint();
      search.push(performance.now() - t1);

      // ArrowDown x5: until the 5th highlight move paints.
      const t2 = performance.now();
      for (let a = 0; a < 5; a += 1) {
        const before = document.querySelector(SELECTED);
        key(input, 'ArrowDown');
        await waitFor(() => document.querySelector(SELECTED) !== before, 2000)
          .catch(() => undefined);
      }
      await nextPaint();
      arrows.push(performance.now() - t2);

      // Remote workspace results: unique query defeats the query cache.
      const t3 = performance.now();
      setInput(input, `zz${i}${Date.now() % 1000}`);
      await waitFor(
        () =>
          !document.querySelector('[cmdk-item][data-value="loading-workspaces"]')
      ).catch(() => undefined);
      await nextPaint();
      remote.push(performance.now() - t3);

      await close(input);
    }
    return {
      arrowNavigation5: stats(arrows),
      host: location.host,
      remoteSettle: stats(remote),
      search5Char: stats(search),
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}x${innerHeight}`,
      warmOpen: stats(warmOpen),
    };
  }

  // Geometry check for 390/728/1024/1440: dialog and list stay inside the
  // viewport; only the list scrolls.
  async function measureGeometry() {
    const { input } = await open();
    setInput(input, '');
    await nextPaint();
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    const list = document.querySelector('[data-slot="command-list"]');
    const d = dialog.getBoundingClientRect();
    const result = {
      dialog: { bottom: d.bottom, left: d.left, right: d.right, top: d.top },
      fitsHorizontally: d.left >= 0 && d.right <= innerWidth,
      fitsVertically: d.top >= 0 && d.bottom <= innerHeight,
      listScrolls: list.scrollHeight > list.clientHeight
        ? getComputedStyle(list).overflowY
        : 'not-needed',
      pageScrollX: document.documentElement.scrollWidth > innerWidth,
      viewport: `${innerWidth}x${innerHeight}`,
    };
    await close(input);
    return result;
  }

  Object.assign(window, {
    measureColdOpen,
    measureCommandCenter,
    measureGeometry,
  });
})();
