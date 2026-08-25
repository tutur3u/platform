'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../accordion';

export interface MarketingFaqItem {
  /** Stable value for the accordion item; also the React key. */
  id: string;
  question: ReactNode;
  answer: ReactNode;
}

/**
 * Marketing FAQ.
 *
 * A single-open accordion rather than a static definition list: an FAQ block
 * long enough to be useful is long enough to bury the closing CTA if every
 * answer is expanded at once.
 */
export function MarketingFaqList({
  items,
  className,
}: {
  items: MarketingFaqItem[];
  className?: string;
}) {
  return (
    <Accordion
      className={cn('mx-auto w-full max-w-3xl', className)}
      collapsible
      type="single"
    >
      {items.map((item) => (
        <AccordionItem
          className="border-foreground/[0.08] border-b"
          key={item.id}
          value={item.id}
        >
          <AccordionTrigger className="py-5 text-left font-display font-medium text-base tracking-[-0.01em] hover:no-underline sm:text-lg">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-foreground/55 text-sm leading-relaxed sm:text-base">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
