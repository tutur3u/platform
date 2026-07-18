'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ReactNode } from 'react';

export type OperatorDialogSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<OperatorDialogSize, string> = {
  // ~28rem — single-field / confirm dialogs
  sm: 'sm:max-w-md',
  // ~42rem — standard forms
  md: 'sm:max-w-2xl',
  // ~56rem — multi-column forms (product, bundle, storefront)
  lg: 'sm:max-w-4xl',
  // ~72rem — dense workflow / listing dialogs
  xl: 'sm:max-w-6xl',
};

/**
 * A dialog content shell that pins the header and footer while only the body
 * scrolls. Compose with `OperatorDialogHeader`, `OperatorDialogBody`, and
 * `OperatorDialogFooter`. For forms, wrap the body + footer in a
 * `<form className="flex min-h-0 flex-1 flex-col">` so the submit button stays
 * pinned and the fields scroll independently.
 */
export function OperatorDialogContent({
  children,
  className,
  mobileFullscreen = false,
  size = 'md',
  ...props
}: ComponentProps<typeof DialogContent> & {
  mobileFullscreen?: boolean;
  size?: OperatorDialogSize;
}) {
  return (
    <DialogContent
      className={cn(
        'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0',
        mobileFullscreen &&
          'inset-0 top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border',
        sizeClass[size],
        className
      )}
      // Keep the dialog calm on open: don't yank focus (and the mobile
      // keyboard) into the first input. Callers can override via props.
      onOpenAutoFocus={(event) => event.preventDefault()}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export function OperatorDialogHeader({
  children,
  className,
  description,
  mobileCollapsibleDescription = false,
  title,
}: {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  mobileCollapsibleDescription?: boolean;
  title: ReactNode;
}) {
  return (
    <DialogHeader
      className={cn(
        'shrink-0 gap-1.5 border-border border-b px-4 pt-4 pr-12 pb-3 text-left sm:px-6 sm:pt-6 sm:pb-4',
        className
      )}
    >
      {mobileCollapsibleDescription && description ? (
        <>
          <Accordion className="sm:hidden" collapsible type="single">
            <AccordionItem className="border-0" value="description">
              <AccordionTrigger className="py-0 pr-0 text-left hover:no-underline">
                <DialogTitle className="text-lg">{title}</DialogTitle>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <DialogDescription className="leading-6">
                  {description}
                </DialogDescription>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="hidden sm:grid sm:gap-1.5">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            <DialogDescription className="leading-6">
              {description}
            </DialogDescription>
          </div>
        </>
      ) : (
        <>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="leading-6">
              {description}
            </DialogDescription>
          ) : null}
        </>
      )}
      {children}
    </DialogHeader>
  );
}

export function OperatorDialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
        className
      )}
    >
      {children}
    </div>
  );
}

export function OperatorDialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-border border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4',
        className
      )}
    >
      {children}
    </div>
  );
}

export type OperatorDialogTab = {
  /** Optional badge/count shown after the label, e.g. a section count. */
  badge?: ReactNode;
  content: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  value: string;
};

/**
 * Splits a long dialog form into digestible tabs. Renders a pinned tab strip
 * under the header and a single scrolling content area, so non-technical
 * operators only face one group of fields at a time. Inputs keep their state in
 * the parent form, so switching tabs never discards values. Place this inside
 * the dialog `<form>` above `OperatorDialogFooter`.
 */
export function OperatorDialogTabs({
  defaultValue,
  onValueChange,
  tabs,
  value,
}: {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  tabs: OperatorDialogTab[];
  value?: string;
}) {
  return (
    <Tabs
      className="flex min-h-0 flex-1 flex-col gap-0"
      defaultValue={defaultValue ?? tabs[0]?.value}
      onValueChange={onValueChange}
      value={value}
    >
      <div className="shrink-0 overflow-x-auto overscroll-x-contain border-border border-b px-4 py-2.5 sm:px-6">
        <TabsList className="h-auto w-max gap-1 bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              className="min-h-10 touch-manipulation gap-1.5 rounded-md px-3 py-1.5 data-[state=active]:bg-muted sm:min-h-0"
              key={tab.value}
              value={tab.value}
            >
              {tab.icon ? (
                <span className="text-muted-foreground">{tab.icon}</span>
              ) : null}
              {tab.label}
              {tab.badge != null ? (
                <span className="ml-0.5 rounded-full bg-muted-foreground/15 px-1.5 text-[0.7rem] text-muted-foreground">
                  {tab.badge}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent
          className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-none sm:px-6 sm:py-5"
          key={tab.value}
          value={tab.value}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * A labelled section inside a flattened (non-stepper) dialog form. Replaces the
 * old multi-step panels with calm, scannable groups.
 */
export function FormSection({
  children,
  className,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className={cn('grid min-w-0 gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="font-medium text-sm leading-tight">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-xs leading-5">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}
