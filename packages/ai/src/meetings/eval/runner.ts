import type { loadDataset } from './dataset';
import {
  type MetricCounts,
  rates,
  scoreTranscript,
  sumCounts,
} from './metrics';
import type { SttProvider } from './providers';

export async function evaluate(
  dataset: Awaited<ReturnType<typeof loadDataset>>,
  providers: readonly SttProvider[]
) {
  const results = [];
  for (const provider of providers) {
    const scores: MetricCounts[] = [];
    let failed = 0;
    for (const clip of dataset.clips) {
      try {
        const texts = await provider.transcribeBatch(
          [{ audio: clip.audio, mediaType: clip.mediaType }],
          { language: clip.language, glossary: dataset.glossary }
        );
        const text = texts[0];
        if (
          texts.length !== 1 ||
          typeof text !== 'string' ||
          Array.from(text).length > 10_000
        ) {
          throw new Error('provider response');
        }
        scores.push(scoreTranscript(clip.reference, text, dataset.glossary));
      } catch {
        // Provider failures may contain credentials, audio or transcript text.
        failed++;
      }
    }
    const counts = sumCounts(scores);
    results.push({
      provider: provider.id,
      model: provider.model,
      total: dataset.clips.length,
      succeeded: scores.length,
      failed,
      counts,
      scores: rates(counts),
    });
  }
  return {
    version: 1,
    normalization: 'vi-nfc-casefold-punctuation-space-v1',
    results,
  };
}

export function markdownReport(
  report: Awaited<ReturnType<typeof evaluate>>
): string {
  const percent = (value: number | null) =>
    value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`;
  return [
    '# Meet transcription evaluation',
    '',
    'Aggregate scores only. Failures are excluded from denominators; compare coverage before ranking providers.',
    '',
    '| Provider | Model | Successful / Total | Failed | WER | CER | Term accuracy |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.results.map(
      (row) =>
        '| ' +
        [
          row.provider,
          row.model,
          `${row.succeeded} / ${row.total}`,
          row.failed,
          percent(row.scores.wer),
          percent(row.scores.cer),
          percent(row.scores.termAccuracy),
        ].join(' | ') +
        ' |'
    ),
    '',
    'WER/CER are corpus micro averages. Vietnamese accents are preserved. CER excludes spaces.',
    'Term accuracy is exact normalized glossary occurrence recall, capped by reference counts.',
    'Zero reference denominators are N/A; insertion errors remain in JSON counts.',
    '',
  ].join('\n');
}
