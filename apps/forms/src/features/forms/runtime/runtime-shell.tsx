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
  layout = 'page',
  toneClasses,
  width = 'wide',
}: {
  bodyFontStyle: CSSProperties;
  children: ReactNode;
  className?: string;
  /**
   * Whether the runtime owns the viewport.
   *
   * `page` is the hosted form at `/f/<shareCode>`, where filling the form is
   * the entire page and a full-height themed background is correct.
   *
   * `inline` is everywhere the runtime is a component inside something else —
   * an embed, the studio preview, the landing demo. `min-h-screen` there
   * claims a viewport it does not have: the landing demo showed one short
   * question above a screen of empty space with its own scrollbar, and the
   * embed reported at least 100vh to its host on every resize, so an embedded
   * form was always a full screen tall no matter how little it contained.
   */
  layout?: 'page' | 'inline';
  toneClasses: FormToneClasses;
  /** The question flow is wider than the screens that bookend it. */
  width?: 'wide' | 'narrow';
}) {
  return (
    <div
      className={cn(
        layout === 'page' ? 'min-h-screen py-10' : 'py-6',
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
