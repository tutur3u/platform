'use client';

import NextError from 'next/error';

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        {/* This is the default Next.js error component, but it doesn't allow omitting the statusCode property yet. */}
        <NextError />
      </body>
    </html>
  );
}
