// @vitest-environment jsdom
import type { LettinWorld } from '@tuturuuu/internal-api/lettin';
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vn from '../../messages/vi.json';
import { Collaborators } from './collaborators';
import { createStarterDraft } from './starter-drafts';

const { mutateAsync, state } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  state: { pending: false, error: null as string | null },
}));
vi.mock('./use-lettin', () => ({
  useLettinMutation: () => ({
    mutateAsync,
    isPending: state.pending,
    errorMessage: state.error,
  }),
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => {
    void _variant;
    return <button {...props} />;
  },
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: Container,
    DialogHeader: Container,
    DialogTitle: Container,
    DialogDescription: Container,
  };
});
const data: LettinWorld = {
  world: {
    id: 'notebook',
    draft: createStarterDraft('Notebook', 'blank', (key) => key),
    published: null,
    published_at: null,
    version: 1,
  },
  role: 'owner',
  entries: [],
  eligibleMembers: [{ user_id: 'member', name: 'Member' }],
  collaborators: [{ user_id: 'member', name: 'Member', role: 'editor' }],
};
beforeEach(() => {
  mutateAsync.mockReset();
  state.pending = false;
  state.error = null;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
function fixture(locale: 'en' | 'vi' = 'en') {
  const messages = locale === 'en' ? en : vn;
  const container = document.createElement('div'),
    root = createRoot(container);
  const render = async (next = data, wsId = 'workspace') =>
    act(() =>
      root.render(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="UTC"
        >
          <Collaborators wsId={wsId} data={next} />
        </NextIntlClientProvider>
      )
    );
  const click = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === label
    )!;
    expect(button).toBeDefined();
    await act(() => button.click());
  };
  const stage = async (role = 'editor') =>
    act(() => {
      const selects = container.querySelectorAll('select');
      selects[0]!.value = 'member';
      selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
      selects[1]!.value = role;
      selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const submit = async () =>
    act(() =>
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    );
  const close = async () => act(() => root.unmount());
  return { messages, container, render, click, stage, submit, close };
}
for (const locale of ['en', 'vi'] as const) {
  it(`reviews editor/publisher capabilities, cancels without action and retains failed review for retry in ${locale}`, async () => {
    const f = fixture(locale);
    try {
      await f.render();
      await f.stage();
      await f.submit();
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(f.container.textContent).toContain(
        f.messages.lettin.collaboratorEditorScope
      );
      await f.click(f.messages.lettin.cancel);
      expect(f.container.querySelector('[role="dialog"]')).toBeNull();
      await f.stage('publisher');
      await f.submit();
      expect(f.container.textContent).toContain(
        f.messages.lettin.collaboratorPublisherScope
      );
      mutateAsync.mockRejectedValueOnce(new Error('Denied'));
      await f.click(f.messages.lettin.confirmCollaboratorAccess);
      expect(mutateAsync).toHaveBeenLastCalledWith({
        action: 'setCollaborator',
        worldId: 'notebook',
        userId: 'member',
        role: 'publisher',
      });
      expect(f.container.querySelector('[role="dialog"]')).not.toBeNull();
      mutateAsync.mockResolvedValueOnce({});
      await f.click(f.messages.lettin.confirmCollaboratorAccess);
      expect(mutateAsync).toHaveBeenCalledTimes(2);
      expect(f.container.querySelector('[role="dialog"]')).toBeNull();
      expect(f.container.querySelectorAll('select')[1]!.value).toBe('editor');
    } finally {
      await f.close();
    }
  });
  it(`reviews removal, suppresses duplicate submission and keeps pending controls disabled in ${locale}`, async () => {
    const f = fixture(locale);
    let finish!: () => void;
    mutateAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    try {
      await f.render();
      await f.click(f.messages.lettin.remove);
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(f.container.textContent).toContain(
        f.messages.lettin.collaboratorRemovalScope
      );
      const confirm = [...f.container.querySelectorAll('button')].find(
        (button) =>
          button.textContent === f.messages.lettin.confirmCollaboratorAccess
      )!;
      await act(() => {
        confirm.click();
        confirm.click();
      });
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mutateAsync).toHaveBeenCalledWith({
        action: 'removeCollaborator',
        worldId: 'notebook',
        userId: 'member',
      });
      state.pending = true;
      await f.render();
      expect(confirm.disabled).toBe(true);
      await act(() => finish());
      expect(f.container.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await f.close();
    }
  });
}
for (const change of [
  'workspace',
  'notebook',
  'eligibility',
  'owner',
] as const) {
  it(`invalidates staged access when ${change} changes`, async () => {
    const f = fixture();
    try {
      await f.render();
      await f.stage();
      await f.submit();
      await f.render(
        {
          ...data,
          ...(change === 'notebook'
            ? { world: { ...data.world, id: 'other' } }
            : {}),
          ...(change === 'eligibility' ? { eligibleMembers: [] } : {}),
          ...(change === 'owner' ? { role: 'editor' as const } : {}),
        },
        change === 'workspace' ? 'other' : 'workspace'
      );
      const confirm = [...f.container.querySelectorAll('button')].find(
        (button) => button.textContent === en.lettin.confirmCollaboratorAccess
      );
      expect(!confirm || confirm.disabled).toBe(true);
      expect(mutateAsync).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
}
