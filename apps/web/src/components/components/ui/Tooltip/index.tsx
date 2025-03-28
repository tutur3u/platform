'use client';

import { TippyProps, TooltipProps } from './types';
import Tippy from '@tippyjs/react/headless';
import React, { forwardRef, useCallback } from 'react';

const isMac =
  typeof window !== 'undefined'
    ? navigator.platform.toUpperCase().indexOf('MAC') >= 0
    : false;

const ShortcutKey = ({ children }: { children: string }): React.ReactNode => {
  const className =
    'inline-flex items-center justify-center w-5 h-5 p-1 text-[0.625rem] rounded font-semibold leading-none border border-neutral-200 text-neutral-500 border-b-2';

  if (children === 'Mod') {
    return <kbd className={className}>{isMac ? '⌘' : 'Ctrl'}</kbd>;
  }

  if (children === 'Shift') {
    return <kbd className={className}>⇧</kbd>;
  }

  if (children === 'Alt') {
    return <kbd className={className}>{isMac ? '⌥' : 'Alt'}</kbd>;
  }

  return <kbd className={className}>{children}</kbd>;
};

export const Tooltip = forwardRef<HTMLSpanElement, TooltipProps>(
  (
    {
      children,
      enabled = true,
      title,
      shortcut,
      tippyOptions = {},
      content,
      ...props
    },
    ref
  ) => {
    const renderTooltip = useCallback(
      (attrs: TippyProps) => (
        <span
          className="z-[999] flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-2.5 py-1 shadow-sm"
          tabIndex={-1}
          data-placement={attrs['data-placement']}
          data-reference-hidden={attrs['data-reference-hidden']}
          data-escaped={attrs['data-escaped']}
        >
          {title && (
            <span className="text-xs font-medium text-neutral-500">
              {title}
            </span>
          )}
          {shortcut && (
            <span className="flex items-center gap-0.5">
              {shortcut.map((shortcutKey) => (
                <ShortcutKey key={shortcutKey}>{shortcutKey}</ShortcutKey>
              ))}
            </span>
          )}
          {content}
        </span>
      ),
      [shortcut, title, content]
    );

    if (!enabled) {
      return (
        <span {...props} ref={ref}>
          {children}
        </span>
      );
    }

    const triggerElement = (
      <span {...props} ref={ref}>
        {children}
      </span>
    );

    return (
      <Tippy
        delay={500}
        offset={[0, 8]}
        touch={false}
        zIndex={99999}
        appendTo={() => document.body}
        {...tippyOptions}
        render={renderTooltip}
      >
        {triggerElement}
      </Tippy>
    );
  }
);

Tooltip.displayName = 'Tooltip';

export default Tooltip;
