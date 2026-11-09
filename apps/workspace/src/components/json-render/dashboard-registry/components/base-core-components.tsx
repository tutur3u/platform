'use client';

import type {
  JsonRenderBadgeProps,
  JsonRenderCalloutProps,
  JsonRenderCardProps,
  JsonRenderComponentContext,
  JsonRenderGridProps,
  JsonRenderIconProps,
  JsonRenderSeparatorProps,
  JsonRenderStackProps,
  JsonRenderTextProps,
} from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { Children, createElement } from 'react';
import { dashboardBaseActionComponents } from './base-core-action-components';
import { dashboardBaseDataComponents } from './base-core-data-components';
import { resolveRegistryIcon } from './base-core-icon';

type LegacyTextProps = JsonRenderTextProps;
type LegacyCalloutProps = JsonRenderCalloutProps;

export const dashboardBaseCoreComponents = {
  Card: ({
    props,
    children,
  }: JsonRenderComponentContext<JsonRenderCardProps>) => {
    const hasContent = Children.count(children) > 0;
    return (
      <Card className="my-2 min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm">
        {(props.title || props.description) && (
          <CardHeader className="gap-1 border-border/30 border-b bg-muted/15 px-5 py-4 text-left">
            {props.title && (
              <CardTitle className="break-words font-semibold text-[15px] leading-tight">
                {props.title}
              </CardTitle>
            )}
            {props.description && (
              <CardDescription className="break-words text-[13px]">
                {props.description}
              </CardDescription>
            )}
          </CardHeader>
        )}
        {hasContent && (
          <CardContent
            className={cn(
              'min-w-0 px-5 py-4',
              !props.title && !props.description && 'pt-5'
            )}
          >
            {children}
          </CardContent>
        )}
      </Card>
    );
  },
  Stack: ({
    props,
    children,
  }: JsonRenderComponentContext<JsonRenderStackProps>) => (
    <div
      className={cn(
        'flex min-w-0 [&>*]:min-w-0',
        props.direction === 'horizontal' ? 'flex-row' : 'flex-col',
        props.align === 'start' && 'items-start',
        props.align === 'center' && 'items-center',
        props.align === 'end' && 'items-end',
        props.align === 'stretch' && 'items-stretch',
        props.justify === 'start' && 'justify-start',
        props.justify === 'center' && 'justify-center',
        props.justify === 'end' && 'justify-end',
        props.justify === 'between' && 'justify-between',
        props.justify === 'around' && 'justify-around'
      )}
      style={{ gap: props.gap !== undefined ? `${props.gap}px` : '1rem' }}
    >
      {children}
    </div>
  ),
  Grid: ({
    props,
    children,
  }: JsonRenderComponentContext<JsonRenderGridProps>) => (
    <div
      className="grid w-full min-w-0 [&>*]:min-w-0"
      style={{
        gridTemplateColumns: `repeat(${props.cols || 1}, minmax(0, 1fr))`,
        gap: props.gap !== undefined ? `${props.gap}px` : '1rem',
      }}
    >
      {children}
    </div>
  ),
  Text: ({ props }: JsonRenderComponentContext<LegacyTextProps>) => {
    const tagMap: Record<string, keyof HTMLElementTagNameMap> = {
      h1: 'h1',
      h2: 'h2',
      h3: 'h3',
      h4: 'h4',
      p: 'p',
      small: 'small',
      tiny: 'span',
    };
    const variant = props.variant ?? 'p';
    const componentTag = tagMap[variant] ?? 'p';
    const isBody = !props.variant || variant === 'p';
    return createElement(
      componentTag,
      {
        className: cn(
          isBody && 'text-[14px] leading-relaxed',
          variant === 'h1' && 'font-bold text-2xl tracking-tight',
          variant === 'h2' && 'font-semibold text-xl tracking-tight',
          variant === 'h3' && 'font-semibold text-lg',
          variant === 'h4' && 'font-medium text-[15px]',
          variant === 'small' && 'text-[13px] leading-normal',
          variant === 'tiny' && 'text-xs leading-normal',
          props.weight === 'normal' && 'font-normal',
          props.weight === 'medium' && 'font-medium',
          props.weight === 'semibold' && 'font-semibold',
          props.weight === 'bold' && 'font-bold',
          !props.color && isBody && 'text-foreground/90',
          props.color === 'muted' && 'text-muted-foreground',
          props.color === 'primary' && 'text-primary',
          props.color === 'success' && 'text-dynamic-green',
          props.color === 'warning' && 'text-dynamic-yellow',
          props.color === 'error' && 'text-dynamic-red',
          props.align === 'center' && 'text-center',
          props.align === 'right' && 'text-right',
          'whitespace-pre-wrap break-words'
        ),
      },
      props.content ?? props.text
    );
  },
  Icon: ({ props }: JsonRenderComponentContext<JsonRenderIconProps>) => {
    const IconComp = resolveRegistryIcon(props.name);
    if (!IconComp) return null;
    const size = props.size || 18;
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 p-2 text-primary"
        style={props.color ? { color: props.color } : undefined}
      >
        <IconComp size={size} strokeWidth={1.75} />
      </span>
    );
  },
  Badge: ({ props }: JsonRenderComponentContext<JsonRenderBadgeProps>) => (
    <Badge variant={props.variant || 'default'}>{props.label}</Badge>
  ),
  Avatar: ({
    props,
  }: JsonRenderComponentContext<{
    src?: string;
    fallback?: string;
    size?: number;
  }>) => (
    <Avatar style={{ width: props.size || 32, height: props.size || 32 }}>
      {props.src && <AvatarImage src={props.src} />}
      <AvatarFallback>{props.fallback || '?'}</AvatarFallback>
    </Avatar>
  ),
  Separator: ({
    props,
  }: JsonRenderComponentContext<JsonRenderSeparatorProps>) => (
    <Separator orientation={props.orientation || 'horizontal'} />
  ),
  Callout: ({ props }: JsonRenderComponentContext<LegacyCalloutProps>) => {
    const variant = props.variant || 'info';
    const variantStyles: Record<
      string,
      { bg: string; border: string; text: string; icon: string }
    > = {
      info: {
        bg: 'bg-primary/5',
        border: 'border-primary/20',
        text: 'text-primary',
        icon: 'Info',
      },
      success: {
        bg: 'bg-dynamic-green/5',
        border: 'border-dynamic-green/20',
        text: 'text-dynamic-green',
        icon: 'CheckCircle',
      },
      warning: {
        bg: 'bg-dynamic-yellow/5',
        border: 'border-dynamic-yellow/20',
        text: 'text-dynamic-yellow',
        icon: 'AlertTriangle',
      },
      error: {
        bg: 'bg-dynamic-red/5',
        border: 'border-dynamic-red/20',
        text: 'text-dynamic-red',
        icon: 'XCircle',
      },
    };
    const style = variantStyles[variant] || variantStyles.info!;
    const CalloutIcon = resolveRegistryIcon(style.icon);
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4',
          style.bg,
          style.border
        )}
      >
        {CalloutIcon && (
          <CalloutIcon className={cn('mt-0.5 h-4 w-4 shrink-0', style.text)} />
        )}
        <div className="min-w-0 flex-1">
          {props.title && (
            <div
              className={cn(
                'mb-0.5 break-words font-semibold text-sm',
                style.text
              )}
            >
              {props.title}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words text-[13px] text-foreground/80 leading-relaxed">
            {props.content ?? props.text}
          </div>
        </div>
      </div>
    );
  },
  ...dashboardBaseActionComponents,
  ...dashboardBaseDataComponents,
};
