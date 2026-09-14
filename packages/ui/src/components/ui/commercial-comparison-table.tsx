'use client';

import { Layers3 } from '@tuturuuu/icons/lucide';
import {
  COMPARISON_TIERS,
  type ComparisonFeature,
  type ComparisonTier,
} from '@tuturuuu/utils/commercial-comparison';
import type { ComparisonCopy } from './commercial-comparison';
import {
  comparisonAppIcon,
  comparisonFocus,
  comparisonTierStyle,
} from './commercial-comparison-style';
import { ComparisonValue } from './comparison-value';

export function ComparisonTable({
  copy,
  visible,
  tiers,
  appIds,
  details,
  valueLabel,
}: {
  copy: ComparisonCopy;
  visible: ComparisonFeature[];
  tiers: ComparisonTier[];
  appIds: string[];
  details: boolean;
  valueLabel: (value: string) => string;
}) {
  return (
    <section
      className={`max-h-[72vh] overflow-auto overscroll-contain rounded-2xl border border-foreground/10 bg-background/20 ${comparisonFocus}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must scroll the comparison region.
      tabIndex={0}
      aria-label={copy.title}
    >
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">{copy.description}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 w-40 min-w-40 border-foreground/10 border-b bg-background px-4 py-5 sm:w-[40%] sm:min-w-64 sm:px-6"
            >
              <span className="flex items-center gap-2 font-mono-ui text-[0.65rem] text-foreground/50 uppercase tracking-[0.12em]">
                <Layers3 aria-hidden className="size-3.5 shrink-0" />
                {copy.feature}
              </span>
            </th>
            {tiers.map((tier) => {
              const { Icon, color, surface } = comparisonTierStyle[tier];
              return (
                <th
                  key={tier}
                  scope="col"
                  className="sticky top-0 z-20 min-w-24 border-foreground/10 border-b bg-background px-3 py-4 text-center sm:min-w-32"
                >
                  <span
                    className={`mx-auto mb-2 flex size-8 items-center justify-center rounded-lg border ${surface} ${color}`}
                  >
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="font-display font-semibold text-sm tracking-tight">
                    {copy.tierNames[tier]}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        {appIds.map((appId) => {
          const rows = visible.filter((row) => row.app === appId);
          if (!rows.length) return null;
          const Icon = comparisonAppIcon(appId);
          const tone =
            comparisonTierStyle[
              COMPARISON_TIERS[appIds.indexOf(appId) % 4] ?? 'plus'
            ];
          return (
            <tbody key={appId}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={tiers.length + 1}
                  className="border-foreground/10 border-b bg-background px-4 py-4 sm:px-6"
                >
                  <span className="sticky left-4 inline-flex items-center gap-3 sm:left-6">
                    <span
                      className={`flex size-8 items-center justify-center rounded-lg border ${tone.surface} ${tone.color}`}
                    >
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="font-display font-semibold tracking-tight">
                      {copy.apps[appId]}
                    </span>
                    <span
                      className="rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono-ui text-[0.6rem] text-foreground/40 tabular-nums"
                      aria-hidden
                    >
                      {rows.length.toString().padStart(2, '0')}
                    </span>
                  </span>
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-80 border-foreground/[0.06] border-b bg-background px-4 py-3 font-normal transition-colors group-hover:bg-muted sm:px-6"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="py-1.5 text-foreground/75 text-xs leading-relaxed sm:text-sm">
                        {copy.features[row.id]}
                      </span>
                      <ComparisonValue
                        value={row.pending ? 'pending' : 'info'}
                        label={
                          row.pending
                            ? copy.pending
                            : (copy.features[row.id] ?? row.id)
                        }
                        context={copy.details}
                        explanation={copy.explanations[row.detail]}
                      />
                    </div>
                    {details && (
                      <p className="mt-1 max-w-lg text-foreground/50 text-xs leading-relaxed">
                        {copy.explanations[row.detail]}
                      </p>
                    )}
                  </th>
                  {tiers.map((tier) => {
                    const value =
                      row.values[COMPARISON_TIERS.indexOf(tier)] ?? 'excluded';
                    return (
                      <td
                        key={tier}
                        className={`border-foreground/[0.06] border-b px-3 py-3 text-center align-middle transition-colors group-hover:bg-foreground/[0.04] ${comparisonTierStyle[tier].column}`}
                      >
                        <ComparisonValue
                          value={value}
                          label={valueLabel(value)}
                          context={`${copy.tierNames[tier]}: ${copy.features[row.id]}`}
                          explanation={copy.explanations[row.detail]}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </section>
  );
}
