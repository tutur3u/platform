// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { afterEach, expect, it, vi } from 'vitest';

const { ask, readPolicy, setChoice, readAudience, openSettings } = vi.hoisted(
  () => ({
    ask: vi.fn(),
    readPolicy: vi.fn(),
    setChoice: vi.fn(),
    readAudience: vi.fn(),
    openSettings: vi.fn(),
  })
);
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: readAudience,
  updateMiraAudienceAttestation: vi.fn(),
}));
vi.mock('./call-settings-link', () => ({
  useOpenCallSettings: () => openSettings,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  askPersonalMeetAssistant: ask,
  readPrivateMiraPolicy: readPolicy,
  setPrivateMiraChoice: setChoice,
  InternalApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./mira-profile', () => ({
  MiraProfile: () => <span>Mira</span>,
  MiraAvatar: () => <span />,
}));
vi.mock('./chat-message-body', () => ({
  ChatMessageBody: ({ body }: { body: string }) => <p>{body}</p>,
}));

import { PersonalChat } from './personal-chat';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([422, 409, 503])(
  'retries status %i with a new ID only for a confirmed terminal receipt',
  async (status) => {
    ask
      .mockRejectedValueOnce(new InternalApiError('unavailable', status))
      .mockResolvedValueOnce({ text: 'Answer' });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <PersonalChat meetingId="room" onShare={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    const first = ask.mock.calls[0]![1].requestId;
    const second = ask.mock.calls[1]![1].requestId;
    if (status === 422) expect(second).not.toBe(first);
    else expect(second).toBe(first);
    await screen.findByText('Answer');
  }
);

it('confirms the current account choice and retries the same private request', async () => {
  ask
    .mockRejectedValueOnce(
      new InternalApiError('Consent required', 403, 'MIRA_CONSENT_REQUIRED')
    )
    .mockResolvedValueOnce({ text: 'Private answer' });
  readPolicy
    .mockResolvedValueOnce({
      accountId: 'actor',
      available: true,
      version: 'notice',
      choice: null,
    })
    .mockResolvedValueOnce({
      accountId: 'actor',
      available: true,
      version: 'notice',
      choice: { choice: 'continue', accountId: 'actor', meetingId: 'room' },
    });
  setChoice.mockResolvedValue({});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersonalChat meetingId="room" accountId="actor" onShare={vi.fn()} />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'personal_enable' })
  );
  expect(setChoice).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'phase_continue' }));
  await screen.findByText('Private answer');
  expect(setChoice).toHaveBeenCalledExactlyOnceWith(
    'room',
    'notice',
    'continue',
    'actor'
  );
  expect(ask.mock.calls[1]?.[1]).toEqual(ask.mock.calls[0]?.[1]);
});

function refuseForWorkspace() {
  ask.mockRejectedValueOnce(
    new InternalApiError(
      'Workspace ineligible',
      403,
      'MIRA_WORKSPACE_UNAVAILABLE'
    )
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PersonalChat
        meetingId="room"
        accountId="actor"
        wsId="workspace"
        onShare={vi.fn()}
      />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
}

it('sends a workspace manager to the Mira settings when the workspace has not declared 18+', async () => {
  readAudience.mockResolvedValue({
    attested: false,
    attestedAt: null,
    attestedByCurrentUser: false,
  });
  refuseForWorkspace();
  fireEvent.click(await screen.findByRole('button', { name: 'open_settings' }));
  expect(openSettings).toHaveBeenCalledExactlyOnceWith('mira');
  expect(readAudience).toHaveBeenCalledWith('workspace');
  expect(screen.getByRole('alert').textContent).toContain('workspace_off');
  expect(screen.queryByText('ask_owner')).toBeNull();
  expect(screen.queryByText('personal_workspace_unavailable')).toBeNull();
  expect(screen.queryByRole('button', { name: 'personal_enable' })).toBeNull();
  expect(setChoice).not.toHaveBeenCalled();
});

it('tells a member to ask the workspace owner when the workspace has not declared 18+', async () => {
  readAudience.mockRejectedValue(new InternalApiError('Denied', 403));
  refuseForWorkspace();
  await screen.findByText('ask_owner');
  expect(screen.getByRole('alert').textContent).toContain('workspace_off');
  expect(screen.queryByRole('button', { name: 'open_settings' })).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  expect(openSettings).not.toHaveBeenCalled();
  expect(setChoice).not.toHaveBeenCalled();
});

it('states the 18+ rule at the private composer and again beside Continue', async () => {
  ask.mockRejectedValueOnce(
    new InternalApiError('Consent required', 403, 'MIRA_CONSENT_REQUIRED')
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersonalChat meetingId="room" accountId="actor" onShare={vi.fn()} />
    </QueryClientProvider>
  );
  const described = (element: HTMLElement) =>
    document.getElementById(element.getAttribute('aria-describedby') ?? '')
      ?.textContent;
  const composer = screen.getByRole('textbox', { name: 'personal_chat' });
  expect(described(composer)).toBe('notice');
  fireEvent.change(composer, { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'personal_enable' })
  );
  expect(
    described(screen.getByRole('button', { name: 'phase_continue' }))
  ).toBe('consent');
  expect(setChoice).not.toHaveBeenCalled();
});

it('opens a supplied slide and sends only the confirmed excerpt through the room callback', async () => {
  ask.mockResolvedValueOnce({ text: 'Private answer with an example' });
  const openSlide = vi.fn();
  const onShare = vi.fn(async () => undefined);
  const referenceForAnswer = vi.fn(() => ({
    title: 'Lesson 04 · Slide 12 · Base cases',
    onOpenSlide: openSlide,
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersonalChat
        meetingId="room"
        onShare={onShare}
        referenceForAnswer={referenceForAnswer}
      />
    </QueryClientProvider>
  );

  expect(screen.getByText('privacy')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'openSlide' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
    target: { value: 'Explain recursion' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
  await screen.findByText('Private answer with an example');
  expect(screen.getByText('privateTag')).toBeTruthy();
  expect(referenceForAnswer).toHaveBeenCalledWith(
    expect.objectContaining({
      question: 'Explain recursion',
      body: 'Private answer with an example',
    })
  );
  expect(ask).toHaveBeenCalledWith(
    'room',
    expect.objectContaining({
      question: 'Explain recursion',
      history: [],
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'openSlide' }));
  expect(openSlide).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'shareSnippet' }));
  expect(onShare).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_share' }), {
    target: { value: 'Reviewed excerpt' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'personal_share_confirm' })
  );
  await waitFor(() => expect(onShare).toHaveBeenCalledWith('Reviewed excerpt'));
});
