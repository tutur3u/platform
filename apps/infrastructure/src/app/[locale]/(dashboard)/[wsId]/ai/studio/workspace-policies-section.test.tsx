import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiStudioWorkspacePolicy } from './types';
import { WorkspaceAiStudioPoliciesSection } from './workspace-policies-section';

const mocks = vi.hoisted(() => ({
  listPolicies: vi.fn(),
  updatePolicy: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  listInfrastructureAiStudioWorkspacePolicies: (...args: unknown[]) =>
    mocks.listPolicies(...args),
}));
vi.mock('./actions', () => ({
  updateWorkspaceAiStudioPolicyAction: (...args: unknown[]) =>
    mocks.updatePolicy(...args),
}));
vi.mock('./model-multi-select', () => ({
  ModelMultiSelect: () => <div data-testid="model-picker" />,
}));

function policy(wsId: string, workspaceName: string): AiStudioWorkspacePolicy {
  return {
    allowedModels: [],
    apiKeyCreationApproved: false,
    apiKeyCreationDecidedAt: null,
    apiKeyCreationDecidedBy: null,
    captureEnabled: null,
    contentRetentionDays: null,
    deniedModels: [],
    metadataRetentionDays: null,
    monthlyCreditBudget: null,
    noTrainingEnforced: true,
    requestsPerMinute: null,
    workspaceName,
    wsId,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceAiStudioPoliciesSection infrastructureWsId="root-workspace" />
    </QueryClientProvider>
  );
}

describe('WorkspaceAiStudioPoliciesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePolicy.mockResolvedValue(undefined);
    mocks.listPolicies.mockImplementation(
      ({ cursor, q }: { cursor?: string; q?: string }) => {
        if (q) {
          return Promise.resolve({
            items: [policy('workspace-search', 'Search result')],
            nextCursor: null,
          });
        }
        if (cursor === '40') {
          return Promise.resolve({
            items: [policy('workspace-2', 'Beta workspace')],
            nextCursor: null,
          });
        }
        return Promise.resolve({
          items: [policy('workspace-1', 'Alpha workspace')],
          nextCursor: '40',
        });
      }
    );
  });

  it('keeps workspace rows compact until their policy editor is expanded', async () => {
    renderSection();

    const row = await screen.findByRole('button', {
      name: /Alpha workspace/,
    });
    expect(
      screen.queryByText('workspaces.api_key_creation')
    ).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(
      await screen.findByText('workspaces.api_key_creation')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('model-picker')).toHaveLength(2);
  });

  it('loads additional pages and searches names or ID fragments server-side', async () => {
    renderSection();

    await screen.findByText('Alpha workspace');
    fireEvent.click(
      screen.getByRole('button', { name: 'workspaces.load_more' })
    );

    await screen.findByText('Beta workspace');
    expect(mocks.listPolicies).toHaveBeenCalledWith({
      cursor: '40',
      limit: 40,
      q: undefined,
    });

    fireEvent.change(screen.getByPlaceholderText('workspaces.search'), {
      target: { value: '001102' },
    });

    await waitFor(() => {
      expect(mocks.listPolicies).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 40,
        q: '001102',
      });
    });
    expect(await screen.findByText('Search result')).toBeInTheDocument();
  });
});
