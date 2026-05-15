import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messages from '../../../../../messages/en.json';
import { WorkflowRunPanel } from '../workflow-run-panel';

describe('WorkflowRunPanel', () => {
  it('renders the latest run trace', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WorkflowRunPanel
          latestRun={{
            actorUserId: 'user-1',
            createdAt: '2026-05-14T00:00:00.000Z',
            error: null,
            finishedAt: '2026-05-14T00:00:01.000Z',
            id: 'run-1',
            input: {},
            output: {},
            serverId: 'server-1',
            startedAt: '2026-05-14T00:00:00.000Z',
            status: 'completed',
            stepTrace: [
              {
                durationMs: 4,
                nodeId: 'trigger',
                nodeType: 'manual_trigger',
                output: { mode: 'manual' },
                status: 'completed',
              },
            ],
            workflowId: 'workflow-1',
          }}
          runs={[]}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('trigger')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
    expect(screen.getByText('manual_trigger')).toBeTruthy();
    expect(screen.getByText('{"mode":"manual"}')).toBeTruthy();
  });
});
