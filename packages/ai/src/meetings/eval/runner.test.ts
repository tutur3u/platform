import { describe, expect, it } from 'vitest';
import type { SttProvider } from './providers';
import { createEvalProviders } from './providers';
import { evaluate, markdownReport } from './runner';

describe('evaluation runner', () => {
  it('passes only audio and hints, reports aggregate scores, and sanitizes failures', async () => {
    let calls = 0;
    const provider: SttProvider = {
      id: 'gemini-flash',
      model: 'fixture',
      async transcribeBatch(clips, hints) {
        expect(clips).toEqual([
          { audio: Buffer.from([0]), mediaType: 'audio/wav' },
        ]);
        expect(hints).toEqual({ language: 'vi', glossary: ['Synthetic Name'] });
        calls++;
        if (calls === 2)
          throw new Error('SECRET_KEY and confidential transcript');
        return ['Synthetic Name works'];
      },
    };
    const clip = {
      audio: Buffer.from([0]),
      mediaType: 'audio/wav',
      language: 'vi',
      reference: 'Synthetic Name works',
    } satisfies Parameters<typeof evaluate>[0]['clips'][number];
    const report = await evaluate(
      { glossary: ['Synthetic Name'], clips: [clip, clip] },
      [provider]
    );
    expect(report.results[0]).toMatchObject({
      succeeded: 1,
      failed: 1,
      total: 2,
      scores: { wer: 0, cer: 0, termAccuracy: 1 },
    });
    expect(calls).toBe(2);
    const output = JSON.stringify(report) + markdownReport(report);
    for (const privateText of [
      'Synthetic Name',
      'works',
      'SECRET_KEY',
      'confidential',
    ])
      expect(output).not.toContain(privateText);
  });
  it('rejects malformed provider batches and keeps all-failed rates unavailable', async () => {
    const report = await evaluate(
      {
        glossary: [],
        clips: [
          {
            audio: Buffer.from([0]),
            mediaType: 'audio/wav',
            language: 'auto',
            reference: 'a',
          },
        ],
      },
      [{ id: 'openai', model: 'fixture', transcribeBatch: async () => [] }]
    );
    expect(report.results[0]).toMatchObject({
      failed: 1,
      succeeded: 0,
      scores: { wer: null, cer: null, termAccuracy: null },
    });
    expect(markdownReport(report)).toContain('N/A');
  });
  it('makes OpenAI explicitly opt-in and validates keys without exposing them', () => {
    const env = {
      GOOGLE_GENERATIVE_AI_API_KEY: 'synthetic-key',
      MEET_STT_EVAL_FLASH_MODEL: 'gemini-flash-fixture',
      OPENAI_API_KEY: 'synthetic-openai',
    };
    expect(createEvalProviders(env).map((p) => p.id)).toEqual([
      'gemini-flash-lite',
      'gemini-flash',
    ]);
    expect(
      createEvalProviders({ ...env, MEET_STT_EVAL_OPENAI: '1' }).map(
        (p) => p.model
      )
    ).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-flash-fixture',
      'gpt-4o-transcribe',
    ]);
    expect(() =>
      createEvalProviders({
        ...env,
        OPENAI_API_KEY: undefined,
        MEET_STT_EVAL_OPENAI: '1',
      })
    ).toThrow('configuration');
    expect(() => createEvalProviders({})).toThrow('configuration');
  });
});
