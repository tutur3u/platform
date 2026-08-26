/**
 * Tuturuuu Forms embed SDK.
 *
 * Usage:
 *   <script src="https://forms.tuturuuu.com/embed.js" async></script>
 *   <div data-tuturuuu-form="SHARE_CODE" data-mode="inline"></div>
 *
 * Deliberately dependency-free and framework-free: it runs on whatever page a
 * customer already has, which may be WordPress, Webflow, or hand-written HTML.
 * Anything that needs a build step would not survive contact with those.
 */
(() => {
  if (window.__tuturuuuFormsEmbedLoaded) return;
  window.__tuturuuuFormsEmbedLoaded = true;

  const MESSAGE_SOURCE = 'tuturuuu-forms';
  const ATTRIBUTE = 'data-tuturuuu-form';
  const MODES = ['inline', 'fullpage', 'popup', 'slider', 'popover', 'sidetab'];
  const OVERLAY_MODES = ['popup', 'slider', 'popover', 'sidetab'];
  const DEFAULT_HEIGHT = 520;

  /**
   * Resolve the origin from this script's own src, so a self-hosted or staging
   * deployment serves its own forms rather than hard-coding production.
   */
  function resolveOrigin() {
    const current = document.currentScript;
    if (current?.src) {
      try {
        return new URL(current.src).origin;
      } catch (_error) {
        /* fall through */
      }
    }

    const scripts = document.getElementsByTagName('script');
    for (let index = scripts.length - 1; index >= 0; index -= 1) {
      const src = scripts[index].src || '';
      if (src.indexOf('/embed.js') !== -1) {
        try {
          return new URL(src).origin;
        } catch (_error) {
          /* keep looking */
        }
      }
    }

    return 'https://forms.tuturuuu.com';
  }

  const ORIGIN = resolveOrigin();
  const registry = Object.create(null);
  let counter = 0;

  function readMode(element) {
    const mode = (element.getAttribute('data-mode') || 'inline').toLowerCase();
    return MODES.indexOf(mode) === -1 ? 'inline' : mode;
  }

  function buildUrl(shareCode) {
    return `${ORIGIN}/embed/${encodeURIComponent(shareCode)}`;
  }

  function createIframe(shareCode, title) {
    const iframe = document.createElement('iframe');
    iframe.src = buildUrl(shareCode);
    iframe.title = title || 'Form';
    iframe.loading = 'lazy';
    iframe.style.width = '100%';
    iframe.style.height = `${DEFAULT_HEIGHT}px`;
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.background = 'transparent';
    iframe.setAttribute('allowtransparency', 'true');
    // The embedded form posts only a height, a public share code and a
    // submitted flag, and needs no access to the host page.
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-same-origin allow-popups'
    );
    return iframe;
  }

  function styleSurface(node, extra) {
    node.style.background = 'var(--tuturuuu-embed-bg, #fff)';
    node.style.borderRadius = '12px';
    node.style.overflow = 'hidden';
    node.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.22)';
    for (const key in extra) {
      if (Object.hasOwn(extra, key)) {
        node.style[key] = extra[key];
      }
    }
  }

  function mountInline(element, entry) {
    element.appendChild(entry.iframe);
  }

  function mountFullpage(element, entry) {
    entry.iframe.style.height = '100vh';
    element.style.display = 'block';
    element.appendChild(entry.iframe);
  }

  /** Shared shell for popup / slider / popover / sidetab. */
  function mountOverlay(element, entry, mode) {
    const backdrop = document.createElement('div');
    backdrop.setAttribute('data-tuturuuu-form-backdrop', '');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.zIndex = '2147483000';
    backdrop.style.display = 'none';
    backdrop.style.background = 'rgba(15, 23, 42, 0.55)';

    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.zIndex = '2147483001';
    panel.style.display = 'none';

    // Every panel needs a DEFINITE height, not just a maxHeight. The iframe
    // inside is `height: 100%`, and a percentage height resolves against an
    // auto-height containing block as `auto` — which collapses the form to the
    // iframe's ~150px intrinsic height. The slider gets it from pinning both
    // `top` and `bottom`; the centred and anchored panels have to say it.
    if (mode === 'popup') {
      styleSurface(panel, {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(680px, calc(100vw - 32px))',
        height: 'min(720px, calc(100vh - 64px))',
        maxHeight: 'calc(100vh - 64px)',
      });
    } else if (mode === 'slider' || mode === 'sidetab') {
      styleSurface(panel, {
        top: '0',
        right: '0',
        bottom: '0',
        width: 'min(520px, 100vw)',
        borderRadius: '12px 0 0 12px',
        maxHeight: '100vh',
      });
    } else {
      styleSurface(panel, {
        right: '20px',
        bottom: '92px',
        width: 'min(400px, calc(100vw - 32px))',
        height: 'min(640px, calc(100vh - 140px))',
        maxHeight: 'min(640px, calc(100vh - 140px))',
      });
    }

    entry.iframe.style.height = '100%';
    panel.appendChild(entry.iframe);

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close form');
    close.textContent = '×';
    close.style.position = 'absolute';
    close.style.top = '8px';
    close.style.right = '10px';
    close.style.zIndex = '1';
    close.style.border = '0';
    close.style.borderRadius = '999px';
    close.style.width = '28px';
    close.style.height = '28px';
    close.style.cursor = 'pointer';
    close.style.fontSize = '18px';
    close.style.lineHeight = '1';
    close.style.background = 'rgba(15, 23, 42, 0.08)';
    close.style.color = 'inherit';
    panel.appendChild(close);

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.textContent =
      element.getAttribute('data-launcher-text') ||
      (mode === 'sidetab' ? 'Feedback' : 'Open form');
    launcher.style.position = 'fixed';
    launcher.style.zIndex = '2147483000';
    launcher.style.cursor = 'pointer';
    launcher.style.border = '0';
    launcher.style.color = '#fff';
    launcher.style.background =
      element.getAttribute('data-launcher-color') || '#6d28d9';
    launcher.style.font =
      '500 14px/1 ui-sans-serif, system-ui, -apple-system, sans-serif';
    launcher.style.boxShadow = '0 10px 30px rgba(15, 23, 42, 0.25)';

    if (mode === 'sidetab') {
      launcher.style.right = '0';
      launcher.style.top = '50%';
      launcher.style.transform = 'translateY(-50%) rotate(180deg)';
      launcher.style.writingMode = 'vertical-rl';
      launcher.style.padding = '18px 10px';
      launcher.style.borderRadius = '8px 0 0 8px';
    } else {
      launcher.style.right = '20px';
      launcher.style.bottom = '20px';
      launcher.style.padding = '14px 20px';
      launcher.style.borderRadius = '999px';
    }

    function open() {
      backdrop.style.display = mode === 'popover' ? 'none' : 'block';
      panel.style.display = 'block';
      launcher.style.display = 'none';
      entry.isOpen = true;
    }

    function closePanel() {
      backdrop.style.display = 'none';
      panel.style.display = 'none';
      launcher.style.display = 'block';
      entry.isOpen = false;
    }

    launcher.addEventListener('click', open);
    close.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && entry.isOpen) closePanel();
    });

    entry.open = open;
    entry.close = closePanel;
    // Overlay chrome is fixed-position, so it belongs on <body> rather than
    // inside whatever container the customer happened to put the div in — a
    // parent with `overflow: hidden` or its own stacking context would
    // otherwise clip or bury it.
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    if (element.getAttribute('data-open') === 'true') open();
  }

  function mount(element) {
    if (element.getAttribute('data-tuturuuu-form-mounted') === 'true') return;

    const shareCode = element.getAttribute(ATTRIBUTE);
    if (!shareCode) return;

    element.setAttribute('data-tuturuuu-form-mounted', 'true');

    counter += 1;
    const mode = readMode(element);
    const entry = {
      id: `tuturuuu-form-${counter}`,
      element: element,
      iframe: createIframe(shareCode, element.getAttribute('data-title')),
      isOpen: false,
      mode: mode,
      shareCode: shareCode,
    };
    registry[shareCode] = entry;

    const height = parseInt(element.getAttribute('data-height') || '', 10);
    if (!Number.isNaN(height) && height > 0) {
      entry.fixedHeight = height;
      entry.iframe.style.height = `${height}px`;
    }

    if (mode === 'inline') {
      mountInline(element, entry);
    } else if (mode === 'fullpage') {
      mountFullpage(element, entry);
    } else if (OVERLAY_MODES.indexOf(mode) !== -1) {
      mountOverlay(element, entry, mode);
    }
  }

  function scan() {
    const nodes = document.querySelectorAll(`[${ATTRIBUTE}]`);
    for (let index = 0; index < nodes.length; index += 1) {
      mount(nodes[index]);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== ORIGIN) return;

    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE) return;

    const entry = registry[data.shareCode];
    if (!entry) return;

    if (data.type === 'resize' && !entry.fixedHeight) {
      // Overlay panels are sized by their own CSS; only flow-positioned
      // embeds grow with their content.
      if (entry.mode === 'inline') {
        entry.iframe.style.height = `${Math.max(data.height || 0, 120)}px`;
      }
      return;
    }

    if (data.type === 'submitted') {
      const element = entry.element;
      if (
        element.getAttribute('data-close-on-submit') !== 'false' &&
        entry.close
      ) {
        window.setTimeout(entry.close, 2500);
      }

      if (typeof window.tuturuuuFormsOnSubmit === 'function') {
        try {
          window.tuturuuuFormsOnSubmit({ shareCode: data.shareCode });
        } catch (_error) {
          /* a host callback must never break the embed */
        }
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Containers added after load (SPA route changes, CMS previews) still mount.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  window.tuturuuuForms = {
    mount: scan,
    open: (shareCode) => {
      const entry = registry[shareCode];
      if (entry?.open) entry.open();
    },
    close: (shareCode) => {
      const entry = registry[shareCode];
      if (entry?.close) entry.close();
    },
  };
})();
