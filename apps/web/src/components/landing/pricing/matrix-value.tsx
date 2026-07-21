import { Check, Minus } from '@tuturuuu/icons/lucide';
import type { FeatureValue } from './feature-matrix-data';

/**
 * One matrix cell. Six states, each with its own weight so the column can be
 * scanned vertically without reading a single word:
 * included, excluded, limited, advanced, beta, and not-yet-shipped.
 */
export function MatrixValue({
  value,
  translate,
}: {
  value: FeatureValue;
  /** Resolves `matrix.values.*` labels. */
  translate: (key: string) => string;
}) {
  if (value === true) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-[0.4rem] border border-dynamic-green/25 bg-dynamic-green/10">
        <Check className="h-3 w-3 text-dynamic-green" />
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <Minus className="h-3 w-3 text-foreground/20" />
      </span>
    );
  }

  if (value === 'beta') {
    return (
      <span className="rounded-full border border-dynamic-yellow/25 bg-dynamic-yellow/10 px-2 py-0.5 font-mono-ui text-[0.55rem] text-dynamic-yellow uppercase tracking-[0.14em]">
        Beta
      </span>
    );
  }

  if (value === 'soon') {
    return (
      <span className="rounded-full border border-foreground/[0.08] px-2 py-0.5 font-mono-ui text-[0.55rem] text-foreground/35 uppercase tracking-[0.14em]">
        {translate('matrix.values.soon')}
      </span>
    );
  }

  const isAdvanced = value === 'advanced';

  return (
    <span
      className={
        isAdvanced
          ? 'font-mono-ui text-[0.6rem] text-dynamic-blue uppercase tracking-[0.14em]'
          : 'font-mono-ui text-[0.6rem] text-foreground/45 uppercase tracking-[0.14em]'
      }
    >
      {translate(`matrix.values.${value}`)}
    </span>
  );
}
