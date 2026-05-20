'use client';

import { defineRegistry, JSONUIProvider, Renderer } from '@json-render/react';
import { dashboardCatalog } from '@tuturuuu/ai/tools/json-render-catalog';
import {
  Brain,
  Check,
  CircleAlert,
  GitMerge,
  Route,
  SearchCheck,
  Sparkles,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button as UiButton } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { resolveMindRenderUiSpec } from './mind-json-render-spec';

type ComponentInput = {
  children?: ReactNode;
  emit?: (event: string, payload?: unknown) => void;
  props: Record<string, unknown>;
};

const iconMap = {
  Brain,
  Check,
  CircleAlert,
  GitMerge,
  Route,
  SearchCheck,
  Sparkles,
  Zap,
};

const toneMap = {
  critical: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  error: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  positive: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  success: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  warning: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
} as const;

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function rows(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function MindIcon({ props }: ComponentInput) {
  const Icon =
    iconMap[text(props.name) as keyof typeof iconMap] ?? iconMap.Sparkles;
  const size = typeof props.size === 'number' ? props.size : 16;

  return <Icon className="shrink-0" style={{ height: size, width: size }} />;
}

function Card({ children, props }: ComponentInput) {
  return (
    <section className="rounded-lg border border-border bg-card/80 p-3">
      {text(props.title) ? (
        <h3 className="font-semibold text-sm">{text(props.title)}</h3>
      ) : null}
      {text(props.description) ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {text(props.description)}
        </p>
      ) : null}
      {children ? <div className="mt-3 space-y-2">{children}</div> : null}
    </section>
  );
}

function Stack({ children, props }: ComponentInput) {
  return (
    <div
      className={cn(
        'flex gap-2',
        props.direction === 'horizontal' ? 'flex-row' : 'flex-col',
        props.align === 'center' && 'items-center',
        props.align === 'end' && 'items-end',
        props.justify === 'between' && 'justify-between',
        props.justify === 'center' && 'justify-center'
      )}
    >
      {children}
    </div>
  );
}

function Grid({ children, props }: ComponentInput) {
  const cols =
    typeof props.cols === 'number' ? Math.max(1, Math.min(props.cols, 4)) : 1;

  return (
    <div
      className={cn(
        'grid gap-2',
        cols === 2 && '@2xl:grid-cols-2',
        cols === 3 && '@2xl:grid-cols-2 @5xl:grid-cols-3',
        cols >= 4 && '@2xl:grid-cols-2 @5xl:grid-cols-4'
      )}
    >
      {children}
    </div>
  );
}

function Text({ props }: ComponentInput) {
  const content = text(props.content ?? props.text);
  const variant = text(props.variant) || 'p';
  const Component = variant === 'h1' || variant === 'h2' ? 'h3' : 'p';

  return (
    <Component
      className={cn(
        'leading-6',
        variant === 'h1' && 'font-semibold text-xl',
        variant === 'h2' && 'font-semibold text-lg',
        variant === 'h3' && 'font-semibold text-base',
        variant === 'small' && 'text-xs',
        props.color === 'muted' && 'text-muted-foreground',
        props.weight === 'bold' && 'font-bold',
        props.weight === 'semibold' && 'font-semibold'
      )}
    >
      {content}
    </Component>
  );
}

function Callout({ props }: ComponentInput) {
  const tone = text(props.variant);

  return (
    <div
      className={cn(
        'rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 p-3 text-dynamic-blue text-sm',
        toneMap[tone as keyof typeof toneMap]
      )}
    >
      {text(props.title) ? (
        <p className="font-medium">{text(props.title)}</p>
      ) : null}
      <p className="mt-0.5 text-foreground/80">
        {text(props.content ?? props.text)}
      </p>
    </div>
  );
}

function ListItem({ props }: ComponentInput) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background/70 p-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue">
        <MindIcon props={{ name: props.icon ?? 'Sparkles' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium text-sm leading-5">
          {text(props.title)}
        </span>
        {text(props.subtitle) ? (
          <span className="mt-0.5 block break-words text-muted-foreground text-xs leading-5">
            {text(props.subtitle)}
          </span>
        ) : null}
      </span>
      {text(props.trailing) ? (
        <Badge className="shrink-0" variant="secondary">
          {text(props.trailing)}
        </Badge>
      ) : null}
    </div>
  );
}

function Progress({ props }: ComponentInput) {
  const value =
    typeof props.value === 'number'
      ? Math.max(0, Math.min(props.value, 100))
      : 0;

  return (
    <div className="space-y-1.5">
      {text(props.label) ? (
        <div className="flex justify-between text-xs">
          <span>{text(props.label)}</span>
          <span className="text-muted-foreground">{value}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-dynamic-blue"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function BarChart({ props }: ComponentInput) {
  return (
    <div className="space-y-2">
      {rows(props.data).map((datum, index) => {
        const item = datum as Record<string, unknown>;
        const value =
          typeof item.value === 'number'
            ? Math.max(0, Math.min(item.value, 100))
            : 0;

        return (
          <div className="grid gap-1" key={`${text(item.label)}-${index}`}>
            <div className="flex justify-between text-xs">
              <span>{text(item.label)}</span>
              <span className="text-muted-foreground">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-dynamic-green"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeyPoints({ props }: ComponentInput) {
  const points = rows(props.points).map(text).filter(Boolean);
  const List = props.ordered ? 'ol' : 'ul';

  return (
    <div className="rounded-md border border-border bg-background/70 p-3">
      {text(props.title) ? (
        <p className="mb-2 font-medium text-sm">{text(props.title)}</p>
      ) : null}
      <List className="space-y-1 pl-4 text-sm">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </List>
    </div>
  );
}

const fallbackComponent = ({ children, props }: ComponentInput) => (
  <Card
    props={{
      description: text(props.description),
      title: text(props.title) || 'Generated section',
    }}
  >
    {children}
  </Card>
);

const components = {
  ArticleHeader: Card,
  Avatar: fallbackComponent,
  Badge: ({ props }: ComponentInput) => (
    <Badge variant="secondary">{text(props.label)}</Badge>
  ),
  BarChart,
  Button: ({ emit, props }: ComponentInput) => (
    <UiButton
      onClick={() => emit?.('press')}
      size="sm"
      type="button"
      variant="secondary"
    >
      {text(props.label)}
    </UiButton>
  ),
  Callout,
  Card,
  Checkbox: fallbackComponent,
  CheckboxGroup: fallbackComponent,
  FileAttachmentInput: fallbackComponent,
  Flashcard: fallbackComponent,
  Form: Card,
  Grid,
  Icon: MindIcon,
  Input: fallbackComponent,
  InsightSection: Card,
  KeyPoints,
  ListItem,
  Metric: ({ props }: ComponentInput) => (
    <div className="rounded-md border border-border bg-background/70 p-3">
      <p className="text-muted-foreground text-xs">{text(props.title)}</p>
      <p className="mt-1 font-semibold text-lg">{text(props.value)}</p>
    </div>
  ),
  MultiFlashcard: fallbackComponent,
  MultiQuiz: fallbackComponent,
  MyTasks: fallbackComponent,
  Progress,
  Quiz: fallbackComponent,
  RadioGroup: fallbackComponent,
  Select: fallbackComponent,
  Separator: () => <div className="h-px bg-border" />,
  SourceList: KeyPoints,
  Stack,
  Stat: ({ props }: ComponentInput) => (
    <Badge className="gap-1" variant="outline">
      {text(props.label)}: {text(props.value)}
    </Badge>
  ),
  Tabs: Card,
  Text,
  Textarea: fallbackComponent,
  TimeTrackingStats: fallbackComponent,
};

const { handlers, registry } = defineRegistry(dashboardCatalog, {
  actions: {},
  components: components as never,
});

const actionHandlers = handlers(
  () => undefined,
  () => ({})
);

export function MindJsonRenderer({ output }: { output: unknown }) {
  const spec = resolveMindRenderUiSpec(output);
  if (!spec) return null;

  return (
    <div className="@container rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-2">
      <JSONUIProvider
        handlers={actionHandlers}
        initialState={{}}
        registry={registry}
      >
        <Renderer registry={registry} spec={spec} />
      </JSONUIProvider>
    </div>
  );
}
