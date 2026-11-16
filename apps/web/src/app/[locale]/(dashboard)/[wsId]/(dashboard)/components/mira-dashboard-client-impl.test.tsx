// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const panels = vi.hoisted(() => ({
  props: [] as Array<{
    draftPrefill?: string;
    onDraftPrefillConsumed?: () => void;
    onResetPanelState?: () => void;
  }>,
}));

vi.mock('./mira-chat-panel', () => ({
  default: (props: (typeof panels.props)[number]) => {
    panels.props.push(props);
    return <div data-testid="panel">{props.draftPrefill ?? ''}</div>;
  },
}));
vi.mock('../hooks/use-mira-soul', () => ({ useMiraSoul: () => ({ data: null }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('./mira-workspace-layout', () => ({
  MiraWorkspaceLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import MiraDashboardClientImpl from './mira-dashboard-client-impl';
import { MIRA_EMBEDDED_HEIGHT_CLASS } from './mira-dashboard-client-types';

describe('MiraDashboardClientImpl draft composition', () => {
  it('hands a validated draft to the first panel only and sizes the embedded panel', async () => {
    const { container } = render(
      <MiraDashboardClientImpl
        currentUser={{ id: 'user-1', email: 'a@example.com' }}
        initialAssistantName="Mira"
        initialDraft="Plan my week"
        variant="embedded"
        wsId="ws-1"
      />
    );

    await waitFor(() => expect(screen.getByTestId('panel')).toHaveTextContent('Plan my week'));
    const root = container.querySelector('[data-dashboard-block="mira"]');
    for (const name of MIRA_EMBEDDED_HEIGHT_CLASS.split(' ')) {
      expect(root?.classList.contains(name)).toBe(true);
    }

    const first = panels.props.at(-1)!;
    act(() => first.onDraftPrefillConsumed?.());
    act(() => first.onResetPanelState?.());

    await waitFor(() => expect(panels.props.at(-1)?.draftPrefill).toBeUndefined());
    expect(screen.getByTestId('panel')).toHaveTextContent('');
  });
});
