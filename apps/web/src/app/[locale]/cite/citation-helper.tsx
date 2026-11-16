'use client';

import { useMutation } from '@tanstack/react-query';
import { lookupCitationSource } from '@tuturuuu/internal-api/cite';
import { type ReactNode, useMemo, useReducer, useRef, useState } from 'react';
import type { CitationStyle } from '@/lib/cite/types';
import { draftToFields, toLookupErrorCode } from './citation-draft';
import { CitationFieldsEditor } from './citation-fields-editor';
import { CitationLookupForm } from './citation-lookup-form';
import { computeCitationOutput } from './citation-output';
import { CitationOutputPanel } from './citation-output-panel';
import { citationReducer, initialCitationState } from './citation-state';

export function CitationHelper({ attribution }: { attribution: ReactNode }) {
  const [state, dispatch] = useReducer(
    citationReducer,
    undefined,
    initialCitationState
  );
  const [style, setStyle] = useState<CitationStyle>('apa');
  const titleRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);

  const lookup = useMutation({
    mutationFn: (input: string) => lookupCitationSource(input),
    retry: false,
  });

  const runLookup = (input: string) => {
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    dispatch({ type: 'lookupStarted', requestId });
    lookup.mutate(input, {
      onSuccess: (result) =>
        dispatch({ type: 'lookupSucceeded', requestId, result }),
      onError: (error) =>
        dispatch({
          type: 'lookupFailed',
          requestId,
          code: toLookupErrorCode(error),
        }),
    });
  };

  const fields = useMemo(() => draftToFields(state.draft), [state.draft]);
  const output = useMemo(
    () => computeCitationOutput(fields, style),
    [fields, style]
  );
  const issues = fields.kind === 'invalid' ? fields.issues : [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:gap-8">
      <div className="min-w-0 space-y-6">
        <CitationLookupForm
          lookup={state.lookup}
          onApplyStale={() => dispatch({ type: 'applyStale' })}
          onDismiss={() => dispatch({ type: 'dismissLookup' })}
          onLookup={runLookup}
          onManualEntry={() => {
            dispatch({ type: 'dismissLookup' });
            titleRef.current?.focus();
          }}
        />
        <CitationFieldsEditor
          draft={state.draft}
          issues={issues}
          onChange={(update) => dispatch({ type: 'edit', update })}
          onReset={() => dispatch({ type: 'reset' })}
          titleRef={titleRef}
        />
      </div>
      <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
        <CitationOutputPanel
          needsReview={
            state.lookup.kind === 'review' || state.lookup.kind === 'manual'
          }
          onStyleChange={setStyle}
          output={output}
          style={style}
        />
        {attribution}
      </div>
    </div>
  );
}
