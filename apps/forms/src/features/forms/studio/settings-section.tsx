'use client';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import type { ComponentType, ReactNode } from 'react';

/**
 * One collapsible block in the studio's settings tab.
 *
 * Every section used to repeat the same twenty lines of trigger markup — icon
 * chip, title, subtitle, the same paddings and border treatment. Extracting it
 * means a change to the settings language lands on all of them at once, and a
 * new section is a title plus its fields.
 */
export function SettingsSection({
  value,
  icon: Icon,
  title,
  description,
  children,
}: {
  /** Accordion item id; also what `defaultValue` on the parent refers to. */
  value: string;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 px-6 shadow-sm"
      value={value}
    >
      <AccordionTrigger className="py-5 hover:no-underline">
        <div className="flex items-start gap-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-base">{title}</p>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="overflow-hidden pb-0">
        <div className="space-y-4 border-border/60 border-t pt-5 pb-5">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
