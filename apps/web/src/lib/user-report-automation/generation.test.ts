import { describe, expect, it } from 'vitest';
import { buildPeriodicReportPrompt } from './generation';

describe('periodic report generation prompt', () => {
  it('contains only the explicitly scoped subject and group context', () => {
    const prompt = buildPeriodicReportPrompt({
      cadence: 'monthly',
      deterministicMetrics: { attended: 4 },
      group: { id: 'group-1', name: 'Mentorship' },
      managerInstruction: 'Focus on consistency.',
      periodEnd: '2026-07-31',
      periodStart: '2026-07-01',
      previousReport: null,
      subject: {
        displayName: 'Ari',
        fullName: null,
        note: 'Prefers written feedback.',
      },
    });

    expect(prompt).toContain('"displayName": "Ari"');
    expect(prompt).toContain('"attended": 4');
    expect(prompt).toContain('Never invent facts');
    expect(prompt).not.toContain('recipient_email');
  });
});
