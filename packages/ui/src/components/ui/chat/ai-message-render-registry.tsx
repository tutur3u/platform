'use client';

import { defineRegistry } from '@json-render/react';
import { dashboardCatalog } from '@tuturuuu/ai/tools/json-render-catalog';
import { BadgeCheck } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { createElement, type ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../card';
import { Progress } from '../progress';
import { Separator } from '../separator';
import { readNumber, readString } from './ai-message-render-utils';

type RenderComponentProps = {
  children?: ReactNode;
  props: Record<string, unknown>;
};

export const { registry: chatAiRegistry } = defineRegistry(dashboardCatalog, {
  components: {
    Card: ({ props, children }: RenderComponentProps) => (
      <Card className="my-2 min-w-0 overflow-hidden rounded-md border bg-card/80">
        {(readString(props.title) || readString(props.description)) && (
          <CardHeader className="gap-1 border-b px-4 py-3">
            {readString(props.title) && (
              <CardTitle className="break-words text-sm">
                {readString(props.title)}
              </CardTitle>
            )}
            {readString(props.description) && (
              <CardDescription className="break-words text-xs">
                {readString(props.description)}
              </CardDescription>
            )}
          </CardHeader>
        )}
        <CardContent className="min-w-0 px-4 py-3">{children}</CardContent>
      </Card>
    ),
    Stack: ({ props, children }: RenderComponentProps) => (
      <div
        className={cn(
          'flex min-w-0 [&>*]:min-w-0',
          props.direction === 'horizontal' ? 'flex-row' : 'flex-col',
          props.align === 'center' && 'items-center',
          props.align === 'end' && 'items-end',
          props.align === 'stretch' && 'items-stretch',
          props.justify === 'center' && 'justify-center',
          props.justify === 'end' && 'justify-end',
          props.justify === 'between' && 'justify-between'
        )}
        style={{ gap: readNumber(props.gap) ?? 12 }}
      >
        {children}
      </div>
    ),
    Grid: ({ props, children }: RenderComponentProps) => (
      <div
        className="grid min-w-0 [&>*]:min-w-0"
        style={{
          gap: readNumber(props.gap) ?? 12,
          gridTemplateColumns: `repeat(${Math.max(
            1,
            Math.min(4, readNumber(props.cols) ?? 1)
          )}, minmax(0, 1fr))`,
        }}
      >
        {children}
      </div>
    ),
    Text: ({ props }: RenderComponentProps) => {
      const variant = readString(props.variant) ?? 'p';
      const tag = (
        ['h1', 'h2', 'h3', 'h4', 'p', 'small'].includes(variant) ? variant : 'p'
      ) as keyof HTMLElementTagNameMap;

      return createElement(
        tag,
        {
          className: cn(
            'whitespace-pre-wrap break-words',
            variant === 'h1' && 'font-bold text-xl',
            variant === 'h2' && 'font-semibold text-lg',
            variant === 'h3' && 'font-semibold',
            variant === 'h4' && 'font-medium',
            (variant === 'p' || variant === 'small') &&
              'text-sm leading-relaxed',
            props.color === 'muted' && 'text-muted-foreground',
            props.color === 'success' && 'text-dynamic-green',
            props.color === 'warning' && 'text-dynamic-yellow',
            props.color === 'error' && 'text-dynamic-red',
            props.weight === 'bold' && 'font-bold',
            props.weight === 'semibold' && 'font-semibold',
            props.weight === 'medium' && 'font-medium',
            props.align === 'center' && 'text-center',
            props.align === 'right' && 'text-right'
          ),
        },
        readString(props.content) ?? readString(props.text) ?? ''
      );
    },
    Badge: ({ props }: RenderComponentProps) => (
      <Badge variant="secondary">{readString(props.label) ?? 'Status'}</Badge>
    ),
    Avatar: ({ props }: RenderComponentProps) => (
      <Avatar
        style={{
          height: readNumber(props.size) ?? 32,
          width: readNumber(props.size) ?? 32,
        }}
      >
        {readString(props.src) && <AvatarImage src={readString(props.src)!} />}
        <AvatarFallback>{readString(props.fallback) ?? '?'}</AvatarFallback>
      </Avatar>
    ),
    Separator: () => <Separator />,
    Callout: ({ props }: RenderComponentProps) => (
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        {readString(props.title) && (
          <div className="mb-1 font-medium">{readString(props.title)}</div>
        )}
        <div className="whitespace-pre-wrap text-muted-foreground">
          {readString(props.content) ?? readString(props.text) ?? ''}
        </div>
      </div>
    ),
    ListItem: ({ props }: RenderComponentProps) => (
      <div className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/20 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <BadgeCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">
            {readString(props.title) ?? 'Item'}
          </span>
          {readString(props.subtitle) && (
            <span className="block truncate text-muted-foreground text-xs">
              {readString(props.subtitle)}
            </span>
          )}
        </span>
        {readString(props.trailing) && (
          <span className="shrink-0 text-muted-foreground text-xs">
            {readString(props.trailing)}
          </span>
        )}
      </div>
    ),
    Progress: ({ props }: RenderComponentProps) => (
      <div className="space-y-1">
        {readString(props.label) && (
          <div className="text-muted-foreground text-xs">
            {readString(props.label)}
          </div>
        )}
        <Progress value={readNumber(props.value) ?? 0} />
      </div>
    ),
    Stat: ({ props }: RenderComponentProps) => (
      <MetricCard
        label={readString(props.label)}
        value={readString(props.value)}
      />
    ),
    Metric: ({ props }: RenderComponentProps) => (
      <MetricCard
        label={readString(props.title)}
        value={readString(props.value)}
      />
    ),
    Button: ({ props }: RenderComponentProps) => (
      <button
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
        type="button"
      >
        {readString(props.label) ?? 'Action'}
      </button>
    ),
  },
  actions: {},
} as never);

function MetricCard({
  label,
  value,
}: {
  label?: string | null;
  value?: string | null;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-muted-foreground text-xs">{label ?? 'Metric'}</div>
      <div className="mt-1 font-semibold text-lg">{value ?? '-'}</div>
    </div>
  );
}
