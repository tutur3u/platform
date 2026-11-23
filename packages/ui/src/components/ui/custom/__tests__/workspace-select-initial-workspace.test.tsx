import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../apps/web/messages/en.json';
import { WorkspaceVisibilityProvider } from '../../../../hooks/use-workspace-visibility';
import { SidebarWorkspaceSelectSection } from '../satellite-workspace-section';
import { WorkspaceSelect } from '../workspace-select';

vi.mock('@tuturuuu/utils/workspace-limits', () => ({
  WORKSPACE_LIMIT_ERROR_CODE: 'WORKSPACE_LIMIT_REACHED',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/workspace',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

const workspaceId = '00000000-0000-4000-8000-0000000000f1';

// Server rendering never resolves client queries, so the list stays pending,
// exactly as in the Finance Worker's signed-in SSR check.
type InitialWorkspace = Parameters<
  typeof WorkspaceSelect
>[0]['initialWorkspace'];

function renderServerShell({
  prop,
  section,
}: {
  prop?: InitialWorkspace;
  section?: InitialWorkspace;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <WorkspaceVisibilityProvider actorId="user-1">
          <SidebarWorkspaceSelectSection initialWorkspace={section}>
            <WorkspaceSelect
              cacheScope="user-1"
              fetchWorkspaces={() => new Promise(() => {})}
              initialWorkspace={prop}
              wsId={workspaceId}
            />
          </SidebarWorkspaceSelectSection>
        </WorkspaceVisibilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('sidebar workspace selector server render', () => {
  const current = {
    avatar_url: null,
    id: workspaceId,
    name: 'Synthetic Finance Workspace',
    personal: false,
  };

  it('names the workspace the sidebar section provides before the list loads', () => {
    // SidebarStructure (every satellite) and the web/workspace shells pass the
    // current workspace to the section; the selector must name it in SSR.
    const html = renderServerShell({ section: current });

    expect(html).toContain('Synthetic Finance Workspace');
    expect(html).not.toContain(`${en.common.loading}...`);
  });

  it('names an explicitly passed initial workspace', () => {
    expect(renderServerShell({ prop: current })).toContain(
      'Synthetic Finance Workspace'
    );
  });

  it('shows the loading label without a server-known workspace', () => {
    expect(renderServerShell({})).toContain(`${en.common.loading}...`);
  });

  it('ignores a server workspace that is not the routed one', () => {
    const html = renderServerShell({
      section: {
        ...current,
        id: '00000000-0000-4000-8000-0000000000f2',
        name: 'Other Workspace',
      },
    });

    expect(html).not.toContain('Other Workspace');
  });
});
