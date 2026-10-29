const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="color-scheme" content="light dark">
  <title>Hive · Maintenance / Bảo trì</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif;
      background: Canvas; color: CanvasText; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 2rem 1.25rem; }
    main { width: min(100%, 38rem); }
    header { display: flex; align-items: baseline; gap: .8rem; margin-bottom: 3rem; }
    strong { font-size: 2rem; letter-spacing: -.06em; }
    .brand { font-size: .95rem; }
    h1, h2 { font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.2; letter-spacing: -.035em; }
    p { line-height: 1.7; max-width: 34rem; }
    section + section { border-top: 1px solid GrayText; margin-top: 2rem; padding-top: 1rem; }
  </style>
</head>
<body>
  <main>
    <header aria-label="Hive by Tuturuuu"><strong>Hive</strong><span class="brand">Tuturuuu</span></header>
    <section aria-labelledby="maintenance-en" lang="en">
      <h1 id="maintenance-en">Hive is under maintenance</h1>
      <p>Hive is temporarily unavailable. Please try again later.</p>
    </section>
    <section aria-labelledby="maintenance-vi" lang="vi">
      <h2 id="maintenance-vi">Hive đang bảo trì</h2>
      <p>Hive tạm thời không khả dụng. Vui lòng thử lại sau.</p>
    </section>
  </main>
</body>
</html>`;

export default {
  fetch(request) {
    return new Response(request.method === 'HEAD' ? null : PAGE, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Language': 'en, vi',
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'Retry-After': '300',
        'X-Content-Type-Options': 'nosniff',
        'X-Hive-Maintenance': '1',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
};
