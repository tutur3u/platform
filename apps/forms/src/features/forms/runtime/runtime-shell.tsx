'use client';

import { cn } from '@tuturuuu/utils/format';
import type { CSSProperties, ReactNode } from 'react';
import { FORM_FONT_VARIABLES } from '../fonts';
import type { FormToneClasses } from './types';

/**
 * The page frame every runtime screen sits in.
 *
 * The welcome screen, the question flow and the confirmation all render the
 * same full-height, themed, font-scoped page. It was written out three times,
 * which is three places to forget when a theme gains a property.
 */
export function RuntimeShell({
  bodyFontStyle,
  children,
  className,
  toneClasses,
  width = 'wide',
}: {
  bodyFontStyle: CSSProperties;
  children: ReactNode;
  className?: string;
  toneClasses: FormToneClasses;
  /** The question flow is wider than the screens that bookend it. */
  width?: 'wide' | 'narrow';
}) {
  return (
    <div
      className={cn(
        'min-h-screen py-10',
        FORM_FONT_VARIABLES,
        toneClasses.pageClassName,
        className
      )}
      style={bodyFontStyle}
    >
      <div
        className={cn(
          'mx-auto flex flex-col gap-8 px-4',
          width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'
        )}
      >
        {children}
      </div>
    </div>
  );
}
