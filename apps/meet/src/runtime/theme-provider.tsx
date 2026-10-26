'use client';

import { ThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';
import { meetThemeBootstrap } from './theme-bootstrap';

export function MeetThemeProvider({
  children,
  ...props
}: ComponentProps<typeof ThemeProvider>) {
  return (
    <ThemeProvider
      {...props}
      scriptProps={{ ...props.scriptProps, type: 'application/json' }}
    >
      <script
        {...props.scriptProps}
        type="text/javascript"
        data-cfasync="false"
        nonce={props.nonce}
        suppressHydrationWarning
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Static initializer with JSON-encoded, HTML-escaped configuration.
        dangerouslySetInnerHTML={{ __html: meetThemeBootstrap(props) }}
      />
      {children}
    </ThemeProvider>
  );
}
