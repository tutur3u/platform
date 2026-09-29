import { describe, expect, it } from 'vitest';
import { summarizeJudgeResult } from './results';

describe('summarizeJudgeResult', () => {
  it('keeps hidden inputs and output private while reporting verdicts and stable timing summaries', () => {
    const result = summarizeJudgeResult(
      JSON.stringify({
        results: [
          {
            durationMs: 9,
            index: 0,
            output: '0 1\n',
            passed: true,
            reason: 'passed',
            visible: true,
          },
          {
            durationMs: 100,
            index: 1,
            output: 'secret answer',
            passed: false,
            reason: 'wrong_answer',
            stderr: 'private diagnostic',
            visible: false,
          },
          {
            durationMs: 11,
            index: 2,
            passed: true,
            reason: 'passed',
            visible: false,
          },
        ],
      })
    );
    expect(result).toMatchObject({
      hiddenPassed: 1,
      hiddenTotal: 2,
      medianDurationMs: 9,
      passed: 2,
      timingRangeMs: [9, 9],
      total: 3,
    });
    expect(result?.results[0]?.output).toBe('0 1\n');
    expect(result?.results[1]).toMatchObject({
      passed: false,
      reason: 'failed',
      visible: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret answer');
    expect(JSON.stringify(result)).not.toContain('private diagnostic');
  });

  it('accepts legacy verdicts without timing', () => {
    expect(
      summarizeJudgeResult(
        JSON.stringify({
          passed: 1,
          results: [
            { index: 0, passed: true, reason: 'passed', visible: true },
          ],
          total: 1,
        })
      )?.medianDurationMs
    ).toBeNull();
  });

  it('normalizes unexpected runner reasons before rendering translated verdicts', () => {
    expect(
      summarizeJudgeResult(
        JSON.stringify({
          results: [
            {
              passed: false,
              reason: 'unexpected_private_detail',
              visible: true,
            },
          ],
        })
      )?.results[0]?.reason
    ).toBe('unknown');
  });
});
