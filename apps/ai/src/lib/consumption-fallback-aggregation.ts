import type { Database } from '@tuturuuu/types/db';

export type BreakdownRow =
  Database['private']['Functions']['get_ai_studio_consumption_breakdown']['Returns'][number];
type GeneratedConsumptionEvent =
  Database['private']['Functions']['list_ai_studio_consumption_events']['Returns'][number];
export type ConsumptionEvent = Omit<
  GeneratedConsumptionEvent,
  'completed_at' | 'error_class' | 'first_token_latency_ms' | 'latency_ms'
> & {
  completed_at: string | null;
  error_class: string | null;
  first_token_latency_ms: number | null;
  latency_ms: number | null;
};
export type LedgerEvent = ConsumptionEvent;

export function mergeConsumptionBreakdowns(
  legacyRows: BreakdownRow[],
  ledgerRows: BreakdownRow[]
) {
  const grouped = new Map<string, BreakdownRow>();

  for (const row of [...legacyRows, ...ledgerRows]) {
    const key = breakdownKey(row);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row });
      continue;
    }

    const currentSamples = Number(current.latency_sample_count);
    const rowSamples = Number(row.latency_sample_count);
    const latencySamples = currentSamples + rowSamples;
    current.aborted_count =
      Number(current.aborted_count) + Number(row.aborted_count);
    current.average_latency_ms =
      latencySamples === 0
        ? 0
        : (Number(current.average_latency_ms) * currentSamples +
            Number(row.average_latency_ms) * rowSamples) /
          latencySamples;
    current.billed_credits =
      Number(current.billed_credits) + Number(row.billed_credits);
    current.unmetered_credits =
      Number(current.unmetered_credits) + Number(row.unmetered_credits);
    current.embedding_units =
      Number(current.embedding_units) + Number(row.embedding_units);
    current.failed_count =
      Number(current.failed_count) + Number(row.failed_count);
    current.image_units = Number(current.image_units) + Number(row.image_units);
    current.input_tokens =
      Number(current.input_tokens) + Number(row.input_tokens);
    current.latency_sample_count = latencySamples;
    current.output_tokens =
      Number(current.output_tokens) + Number(row.output_tokens);
    current.provider_cost_usd =
      Number(current.provider_cost_usd) + Number(row.provider_cost_usd);
    current.reasoning_tokens =
      Number(current.reasoning_tokens) + Number(row.reasoning_tokens);
    current.request_count =
      Number(current.request_count) + Number(row.request_count);
    current.search_units =
      Number(current.search_units) + Number(row.search_units);
    current.succeeded_count =
      Number(current.succeeded_count) + Number(row.succeeded_count);
  }

  return [...grouped.values()].sort((a, b) =>
    breakdownKey(a).localeCompare(breakdownKey(b))
  );
}

export function aggregateLedgerEvents(events: LedgerEvent[]) {
  const grouped = new Map<string, BreakdownRow>();

  for (const event of events) {
    const bucketDate = event.created_at.slice(0, 10);
    const key = [
      bucketDate,
      event.model_id,
      event.feature,
      event.source_type,
      event.source_id,
      event.execution_mode,
    ].join('\u0000');
    const current = grouped.get(key);
    if (current) {
      current.billed_credits =
        Number(current.billed_credits) + Number(event.billed_credits);
      current.image_units =
        Number(current.image_units) + Number(event.image_units);
      current.input_tokens =
        Number(current.input_tokens) + Number(event.input_tokens);
      current.output_tokens =
        Number(current.output_tokens) + Number(event.output_tokens);
      current.provider_cost_usd =
        Number(current.provider_cost_usd) + Number(event.provider_cost_usd);
      current.reasoning_tokens =
        Number(current.reasoning_tokens) + Number(event.reasoning_tokens);
      current.request_count = Number(current.request_count) + 1;
      current.unmetered_credits =
        Number(current.unmetered_credits) + Number(event.unmetered_credits);
      current.search_units =
        Number(current.search_units) + Number(event.search_units);
      current.succeeded_count = Number(current.succeeded_count) + 1;
      continue;
    }

    grouped.set(key, {
      aborted_count: 0,
      average_latency_ms: 0,
      billed_credits: event.billed_credits,
      bucket_date: bucketDate,
      embedding_units: 0,
      execution_mode: event.execution_mode,
      failed_count: 0,
      feature: event.feature,
      image_units: event.image_units,
      input_tokens: event.input_tokens,
      latency_sample_count: 0,
      model_id: event.model_id,
      output_tokens: event.output_tokens,
      provider_cost_usd: event.provider_cost_usd,
      reasoning_tokens: event.reasoning_tokens,
      request_count: 1,
      search_units: event.search_units,
      source_id: event.source_id,
      source_type: event.source_type,
      succeeded_count: 1,
      unmetered_credits: event.unmetered_credits,
    });
  }

  return [...grouped.values()];
}

function breakdownKey(row: BreakdownRow) {
  return [
    row.bucket_date,
    row.model_id,
    row.feature,
    row.source_type,
    row.source_id,
    row.execution_mode,
  ].join('\u0000');
}
