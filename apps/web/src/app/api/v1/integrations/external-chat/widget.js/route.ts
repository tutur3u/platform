import { NextResponse } from 'next/server';

const WIDGET_SOURCE = `(() => {
  const script = document.currentScript;
  if (!script || script.dataset.connectedChatMounted === 'true') return;
  script.dataset.connectedChatMounted = 'true';
  const bindingId = script.dataset.workspace;
  if (!bindingId) return;
  const mount = () => {
    if (!document.body) return;
    const host = document.createElement('div');
    host.dataset.connectedChatWidget = bindingId;
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{font:14px system-ui}button{border:0;background:#111827;color:#fff;padding:10px 14px;cursor:pointer}button[data-toggle]{position:fixed;right:20px;bottom:20px;border-radius:999px;z-index:2147483647}dialog{position:fixed;right:20px;bottom:72px;left:auto;margin:0;width:min(340px,calc(100vw - 40px));border:1px solid #d1d5db;border-radius:8px;padding:16px;box-shadow:0 12px 32px #0002}form{display:flex;gap:8px}input{min-width:0;flex:1;padding:8px;border:1px solid #d1d5db;border-radius:4px}[data-status]{min-height:20px;color:#4b5563;font-size:12px}</style><button data-toggle type="button">Chat</button><dialog><p>Support chat</p><form><input aria-label="Message" maxlength="10000" required><button type="submit">Send</button></form><p aria-live="polite" data-status></p></dialog>';
    const toggle = root.querySelector('button');
    const dialog = root.querySelector('dialog');
    const form = root.querySelector('form');
    const status = root.querySelector('[data-status]');
    toggle.addEventListener('click', () => dialog.open ? dialog.close() : dialog.show());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('input');
      const content = input.value.trim();
      if (!content) return;
      const handled = !window.dispatchEvent(new CustomEvent('tuturuuu:connected-chat-send', {
        cancelable: true,
        detail: {
          bindingId,
          content,
          context: {
            pageUrl: window.location.href,
            referrer: document.referrer || null
          }
        }
      }));
      if (handled) {
        input.value = '';
        status.textContent = 'Queued for delivery';
      } else {
        status.textContent = 'Chat transport is not connected';
      }
    });
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();`;

export function GET() {
  return new NextResponse(WIDGET_SOURCE, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Type': 'application/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
