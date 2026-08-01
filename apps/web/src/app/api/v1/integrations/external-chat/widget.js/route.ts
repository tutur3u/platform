import { NextResponse } from 'next/server';

const WIDGET_SOURCE = `(() => {
  const script = document.currentScript;
  if (!script || script.dataset.connectedChatMounted === 'true') return;
  script.dataset.connectedChatMounted = 'true';
  const bindingId = script.dataset.workspace || '';
  const host = document.createElement('div');
  host.dataset.connectedChatWidget = bindingId;
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{font:14px system-ui}button{position:fixed;right:20px;bottom:20px;border:0;border-radius:999px;background:#111827;color:#fff;padding:12px 16px;cursor:pointer;z-index:2147483647}dialog{position:fixed;right:20px;bottom:72px;left:auto;margin:0;width:min(340px,calc(100vw - 40px));border:1px solid #d1d5db;border-radius:8px;padding:16px;box-shadow:0 12px 32px #0002}form{display:flex;gap:8px}input{min-width:0;flex:1;padding:8px;border:1px solid #d1d5db;border-radius:4px}</style><button type="button">Chat</button><dialog><p>Support chat</p><form><input aria-label="Message" maxlength="10000" required><button type="submit">Send</button></form></dialog>';
  const toggle = root.querySelector('button');
  const dialog = root.querySelector('dialog');
  const form = root.querySelector('form');
  toggle.addEventListener('click', () => dialog.open ? dialog.close() : dialog.show());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const content = input.value.trim();
    if (!content) return;
    window.dispatchEvent(new CustomEvent('tuturuuu:connected-chat-send', {
      detail: { bindingId, content }
    }));
    input.value = '';
  });
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
