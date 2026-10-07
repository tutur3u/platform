import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';

export type ReportDraftValues = {
  title: string;
  content: string;
  feedback: string;
};

export function useReportDraftSync(
  form: UseFormReturn<ReportDraftValues>,
  scope: Array<string | null | undefined>,
  values: ReportDraftValues
) {
  const lastSnapshot = useRef<{ scope: string; values: string } | null>(null);
  const scopeSignature = JSON.stringify(scope);
  const valuesSignature = JSON.stringify(values);
  const hasEdits = Object.keys(form.formState.dirtyFields).length > 0;

  useEffect(() => {
    const previous = lastSnapshot.current;
    if (
      previous?.scope === scopeSignature &&
      previous.values === valuesSignature
    )
      return;
    const current = form.getValues();
    const acknowledged = (['title', 'content', 'feedback'] as const).every(
      (field) => current[field] === values[field]
    );
    lastSnapshot.current = { scope: scopeSignature, values: valuesSignature };
    form.reset(values, {
      keepDirtyValues:
        previous?.scope === scopeSignature && hasEdits && !acknowledged,
    });
  }, [form, hasEdits, scopeSignature, values, valuesSignature]);
}
