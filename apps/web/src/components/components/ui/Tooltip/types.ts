import { TippyProps as HeadlessTippyProps } from '@tippyjs/react/headless';
import React from 'react';
import { Placement } from 'tippy.js';

type HTMLSpanProps = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'content' | 'title'
>;

export interface TooltipProps extends HTMLSpanProps {
  children?: React.ReactNode;
  enabled?: boolean;
  title?: string;
  shortcut?: string[];
  tippyOptions?: Partial<HeadlessTippyProps>;
  content?: React.ReactNode;
}

export interface TippyProps {
  'data-placement': Placement;
  'data-reference-hidden'?: string;
  'data-escaped'?: string;
}
