'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MAIL_EXPAND_DELIVERIES_EVENT } from './mail-delivery-events';

export function MailDeliveryDisclosure({
  reveal,
  children,
}: {
  reveal: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(reveal);
  useLayoutEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  useLayoutEffect(() => {
    const element = ref.current;
    // Keyboard navigation needs the row visible before it can move focus.
    const expand = () => flushSync(() => setExpanded(true));
    element?.addEventListener(MAIL_EXPAND_DELIVERIES_EVENT, expand);
    return () =>
      element?.removeEventListener(MAIL_EXPAND_DELIVERIES_EVENT, expand);
  }, []);
  return (
    <details
      ref={ref}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      {children}
    </details>
  );
}
