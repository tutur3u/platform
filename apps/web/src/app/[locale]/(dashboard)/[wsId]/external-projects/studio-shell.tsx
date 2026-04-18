'use client';

import { Eye, PanelLeft, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function StudioShell({
  actionBar,
  activityPanel,
  contentRail,
  hero,
  previewDrawerDescription,
  previewDrawerTitle,
  previewPanel,
  rightColumn,
}: {
  actionBar: ReactNode;
  activityPanel: ReactNode;
  contentRail: ReactNode;
  hero: ReactNode;
  previewDrawerDescription: string;
  previewDrawerTitle: string;
  previewPanel: ReactNode;
  rightColumn: ReactNode;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="space-y-4 pb-6">
      {hero}

      <div className="sticky top-20 z-20 -mx-1 rounded-[1.6rem] border border-border/70 bg-background/85 px-1 py-1 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="flex flex-wrap items-center gap-3 rounded-[1.2rem] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-4 py-3">
          <div className="min-w-0 flex-1">{actionBar}</div>
          <Button
            variant="outline"
            className="h-9 rounded-full px-4 xl:hidden"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {previewDrawerTitle}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px] 2xl:grid-cols-[340px_minmax(0,1fr)_390px]">
        <div className="space-y-4">
          {contentRail}
          <div className="xl:hidden">{activityPanel}</div>
          <div className="hidden xl:block">{activityPanel}</div>
        </div>
        <div className="space-y-4">{rightColumn}</div>
        <div className="hidden xl:block">
          <div className="sticky top-40">{previewPanel}</div>
        </div>
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>{previewDrawerTitle}</SheetTitle>
            <SheetDescription>{previewDrawerDescription}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{previewPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function StudioHero({
  badges,
  eyebrow,
  metrics,
  title,
  description,
}: {
  badges?: ReactNode;
  description: string;
  eyebrow: string;
  metrics: ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end xl:gap-6 xl:p-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <div className="space-y-2">
            <h1 className="max-w-3xl font-semibold text-3xl tracking-tight xl:text-[2.35rem]">
              {title}
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-6">
              {description}
            </p>
          </div>
          {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[290px]">
          {metrics}
        </div>
      </div>
    </section>
  );
}

export function StudioActionBar({
  actions,
  description,
  label,
}: {
  actions: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
          {label}
        </div>
        <div className="mt-1 max-w-2xl text-sm leading-6">{description}</div>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function ContentRail({
  children,
  description,
  headerAction,
  title,
}: {
  children: ReactNode;
  description: string;
  headerAction?: ReactNode;
  title: string;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function RailSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
        {label}
      </div>
      {children}
    </div>
  );
}

export function RailCollectionButton({
  active,
  badge,
  description,
  onClick,
  title,
}: {
  active: boolean;
  badge?: ReactNode;
  description?: string | null;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
        active
          ? 'border-foreground/20 bg-background shadow-sm'
          : 'border-border/70 bg-background/35 hover:border-border hover:bg-background/55'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="truncate font-medium">{title}</div>
          {description ? (
            <p className="line-clamp-2 text-muted-foreground text-sm leading-5">
              {description}
            </p>
          ) : null}
        </div>
        {badge}
      </div>
    </button>
  );
}

export function EntryList({
  children,
  isEmpty,
}: {
  children: ReactNode;
  isEmpty: boolean;
}) {
  return (
    <div
      className={cn(
        'space-y-3',
        !isEmpty && 'max-h-[30rem] overflow-y-auto pr-1 xl:max-h-[42rem]'
      )}
    >
      {children}
    </div>
  );
}

export function EntryCard({
  active,
  accent,
  body,
  eyebrow,
  onClick,
  title,
}: {
  active: boolean;
  accent?: ReactNode;
  body: ReactNode;
  eyebrow?: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
        active
          ? 'border-foreground/20 bg-background shadow-sm'
          : 'border-border/70 bg-background/35 hover:border-border hover:bg-background/55'
      )}
    >
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {eyebrow}
          <div className="truncate font-medium">{title}</div>
        </div>
        {accent}
      </div>
      {body}
    </button>
  );
}

export function EditorPanel({
  children,
  description,
  headerAction,
  title,
}: {
  children: ReactNode;
  description: string;
  headerAction?: ReactNode;
  title: string;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

export function PreviewPanel({
  payloadDescription,
  payloadTitle,
  payloadView,
  renderedDescription,
  renderedTitle,
  renderedView,
}: {
  payloadDescription: string;
  payloadTitle: string;
  payloadView: ReactNode;
  renderedDescription: string;
  renderedTitle: string;
  renderedView: ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle>{renderedTitle}</CardTitle>
        <CardDescription>{renderedDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rendered" className="space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-full bg-background/70 p-1">
            <TabsTrigger value="rendered">{renderedTitle}</TabsTrigger>
            <TabsTrigger value="payload">{payloadTitle}</TabsTrigger>
          </TabsList>
          <TabsContent value="rendered" className="space-y-4">
            {renderedView}
          </TabsContent>
          <TabsContent value="payload" className="space-y-4">
            <div className="text-muted-foreground text-sm">
              {payloadDescription}
            </div>
            {payloadView}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function ActivityPanel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
          <PanelLeft className="h-3.5 w-3.5" />
          {title}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 px-3.5 py-3">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/80 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
          {label}
        </div>
        <div className="mt-0.5 font-semibold text-lg">{value}</div>
      </div>
    </div>
  );
}

export function EmptyPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 border-dashed bg-background/25 px-4 py-10 text-center">
      <div className="font-medium">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm leading-6">
        {description}
      </div>
    </div>
  );
}

export function StatusBadge({
  draftLabel,
  isPublished,
  publishedLabel,
}: {
  draftLabel: string;
  isPublished: boolean;
  publishedLabel: string;
}) {
  return (
    <Badge variant={isPublished ? 'default' : 'secondary'}>
      {isPublished ? publishedLabel : draftLabel}
    </Badge>
  );
}
