import { describe, expect, it } from 'vitest';
import { buildPeriodicReportPrompt } from './generation';
import {
  recoveryEvidence,
  recoveryReport,
  recoveryRun,
  recoveryUser,
} from './processor-recovery.fixture';

describe('periodic report generation prompt', () => {
  it('contains only the explicitly scoped subject and group context', () => {
    const prompt = buildPeriodicReportPrompt({
      identity: {
        wsId: recoveryRun.ws_id,
        reportId: recoveryReport.id,
        userId: recoveryUser.id,
        groupId: recoveryRun.group_id,
        cadence: recoveryRun.cadence,
        periodStart: recoveryRun.period_start,
        periodEnd: recoveryRun.period_end,
      },
      scheduleOrigin: {
        status: 'verified-automation',
        automationRunId: recoveryRun.id,
        scheduleId: recoveryRun.schedule_id,
        scheduleTimezone: 'UTC',
      },
      humanFeedbackEvidence: recoveryEvidence,
      cadence: 'monthly',
      deterministicMetrics: { attended: 4 },
      group: { id: recoveryRun.group_id, name: 'Mentorship' },
      managerInstruction: 'Focus on consistency.',
      periodEnd: recoveryRun.period_end,
      periodStart: recoveryRun.period_start,
      previousReport: null,
      subject: {
        displayName: 'Ari',
        fullName: null,
        note: 'Prefers written feedback.',
      },
    });

    const context = JSON.parse(
      prompt.split('Other scoped context JSON:\n')[1] ?? ''
    );
    expect(context.subject.displayName).toBe('Ari');
    expect(context.deterministicMetrics.attended).toBe(4);
    expect(prompt).toContain('Never invent facts');
    expect(prompt).not.toContain('recipient_email');
  });
});
