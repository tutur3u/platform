'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';

/** Public cases only: never pass the judge's hidden case payload here. */
export function CodingCases({
  cases,
}: {
  cases: { input: string; output: string }[];
}) {
  const t = useTranslations('coding');
  return (
    <Accordion type="multiple" className="space-y-2">
      {cases.map((testCase, index) => (
        <AccordionItem
          className="rounded-lg border px-3"
          key={index}
          value={`case-${index}`}
        >
          <AccordionTrigger className="py-3 text-xs">
            {t('publicCase', { number: index + 1 })}
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3">
              <div>
                <p className="mb-1 text-muted-foreground text-xs">
                  {t('input')}
                </p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
                  {testCase.input}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-muted-foreground text-xs">
                  {t('expectedOutput')}
                </p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">
                  {testCase.output}
                </pre>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
