'use client';

import { ChevronDown } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Panel } from '../shared/section-shell';
import { featureCategories, matrixColumns } from './feature-matrix-data';
import { MatrixValue } from './matrix-value';

const CELL = 'px-3 py-3 sm:px-4';

export function FeatureMatrix() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('landing.pricing');

  /**
   * The matrix addresses message keys that are only known at runtime
   * (`matrix.featuresList.<name>`), which the generated `next-intl` key union
   * cannot express. One narrowing here keeps the rest of the file honest.
   */
  const tr = useMemo(() => t as unknown as (key: string) => string, [t]);

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <CollapsibleTrigger asChild>
        <Button
          className="mx-auto flex items-center gap-2.5 rounded-full border border-foreground/[0.09] bg-foreground/[0.02] px-5 py-2 font-mono-ui text-[0.68rem] text-foreground/55 uppercase tracking-[0.16em] transition-colors hover:border-foreground/15 hover:bg-foreground/[0.05] hover:text-foreground"
          variant="ghost"
        >
          {t('compare')}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-300',
              isOpen && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Panel className="mt-8">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr>
                  <th
                    className={cn(
                      CELL,
                      'sticky top-0 z-20 border-foreground/10 border-b bg-background/85 text-left font-mono-ui font-normal text-[0.62rem] text-foreground/40 uppercase tracking-[0.18em] backdrop-blur-md'
                    )}
                    scope="col"
                  >
                    {t('matrix.featuresLabel')}
                  </th>
                  {matrixColumns.map((column) => (
                    <th
                      className={cn(
                        CELL,
                        'sticky top-0 z-20 border-foreground/10 border-b bg-background/85 text-center font-mono-ui font-normal text-[0.62rem] uppercase tracking-[0.18em] backdrop-blur-md',
                        column.header
                      )}
                      key={column.key}
                      scope="col"
                    >
                      {tr(column.nameKey)}
                    </th>
                  ))}
                </tr>
              </thead>

              {featureCategories.map((category) => (
                <tbody key={category.category}>
                  <tr>
                    <th
                      className="border-foreground/[0.07] border-y bg-foreground/[0.025] px-3 py-2 text-left font-mono-ui font-normal text-[0.58rem] text-foreground/45 uppercase tracking-[0.2em] sm:px-4"
                      colSpan={matrixColumns.length + 1}
                      scope="colgroup"
                    >
                      {tr(`matrix.categories.${category.category}`)}
                    </th>
                  </tr>

                  {category.features.map((feature, index) => (
                    <tr
                      className={cn(
                        'group transition-colors duration-200 hover:bg-foreground/[0.035]',
                        index < category.features.length - 1 &&
                          '[&>*]:border-foreground/[0.05] [&>*]:border-b'
                      )}
                      key={feature.name}
                    >
                      <th
                        className={cn(
                          CELL,
                          'text-left font-normal text-foreground/65 text-sm transition-colors duration-200 group-hover:text-foreground'
                        )}
                        scope="row"
                      >
                        {tr(`matrix.featuresList.${feature.name}`)}
                      </th>

                      {matrixColumns.map((column) => (
                        <td className={cn(CELL, column.tint)} key={column.key}>
                          <span className="flex items-center justify-center">
                            <MatrixValue
                              translate={tr}
                              value={feature[column.key]}
                            />
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Panel>
      </CollapsibleContent>
    </Collapsible>
  );
}
