'use client';

import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { ThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';
import { meetThemeBootstrap } from './theme-bootstrap';

export function MeetThemeProvider({
  children,
  ...props
}: ComponentProps<typeof ThemeProvider>) {
  const nonce = props.nonce ?? globalThis.__meetCspNonce?.();
  return (
    <ThemeProvider
      {...props}
      scriptProps={{ ...props.scriptProps, type: 'application/json' }}
    >
      <script
        {...props.scriptProps}
        type="text/javascript"
        data-cfasync="false"
        nonce={nonce}
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger -- meetThemeBootstrap JSON-encodes and HTML-escapes its configuration.
        dangerouslySetInnerHTML={{ __html: meetThemeBootstrap(props) }}
      />
      <SorbetPrePaintScript nonce={nonce} />
      {children}
    </ThemeProvider>
  );
}
