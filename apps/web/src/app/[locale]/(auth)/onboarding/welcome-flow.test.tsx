// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeFlow, type WelcomeFlowProps } from './welcome-flow';

const mocks = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  createWorkspace: vi.fn(),
  getUserConfig: vi.fn(),
  inviteMembers: vi.fn(),
  listInvitations: vi.fn(),
  persistLocale: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
  updateAccountPreferences: vi.fn(),
  updateProfile: vi.fn(),
  updateProgress: vi.fn(),
  updateUserConfig: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  // Only the step announcement carries its values, so its wording is testable.
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === 'step_announcement' && values
      ? `${key}:${values.current}/${values.total}:${values.title}`
      : key,
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: mocks.setTheme, theme: 'system' }),
}));
vi.mock('@tuturuuu/ui/custom/locale-preference', () => ({
  persistLocalePreference: mocks.persistLocale,
}));
vi.mock('@/constants/common', () => ({ LOCALE_COOKIE_NAME: 'NEXT_LOCALE' }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...rest }: { children: unknown; href: string }) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
  supportedLocales: ['en', 'vi'],
  usePathname: () => '/onboarding',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/components/settings/settings-avatar', () => ({
  default: () => <div data-testid="avatar-editor" />,
}));
vi.mock('./actions', () => ({
  createWorkspaceFromOnboarding: mocks.createWorkspace,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  acceptWorkspaceInvite: mocks.acceptInvite,
  getUserConfig: mocks.getUserConfig,
  inviteWorkspaceMembers: mocks.inviteMembers,
  listWorkspaceInvitations: mocks.listInvitations,
  updateAccountNotificationPreferences: mocks.updateAccountPreferences,
  updateConnectedOnboardingProgress: mocks.updateProgress,
  updateCurrentUserProfile: mocks.updateProfile,
  updateUserConfig: mocks.updateUserConfig,
}));

const PROPS: WelcomeFlowProps = {
  avatarUser: { avatar_url: null, display_name: 'Lan Nguyen', id: 'user-1' },
  calendarOrigin: 'https://calendar.test',
  displayName: 'Lan Nguyen',
  initialStep: 'profile',
  tasksOrigin: 'https://tasks.test',
};

function renderFlow(overrides: Partial<WelcomeFlowProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <WelcomeFlow {...PROPS} {...overrides} />
    </QueryClientProvider>
  );
  return render(ui);
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

function lastProgress() {
  return mocks.updateProgress.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateProgress.mockResolvedValue({});
  mocks.updateAccountPreferences.mockResolvedValue({ success: true });
  mocks.updateProfile.mockResolvedValue({});
  mocks.getUserConfig.mockResolvedValue({ value: null });
  mocks.updateUserConfig.mockResolvedValue({});
  mocks.listInvitations.mockResolvedValue({ invitations: [] });
  mocks.createWorkspace.mockResolvedValue({
    success: true,
    workspaceId: 'ws-team',
  });
  mocks.inviteMembers.mockResolvedValue({ successCount: 1 });
  mocks.acceptInvite.mockResolvedValue({});
});

describe('product news by email', () => {
  it('ships disabled and off, with the coming-soon note', () => {
    renderFlow();
    const toggle = screen.getByRole('switch', { name: 'news_title' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('news_description');
  });

  it('stores nothing when the person continues past the profile step', async () => {
    renderFlow();
    click('continue');
    await waitFor(() =>
      expect(lastProgress()).toMatchObject({ current_step: 'space' })
    );
    expect(mocks.updateAccountPreferences).not.toHaveBeenCalled();
  });

  it('stores nothing when the profile step or the whole flow is skipped', async () => {
    const first = renderFlow();
    click('skip_for_now');
    await screen.findByText('space_title');
    first.unmount();

    renderFlow();
    click('skip_setup');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/personal'));
    expect(mocks.updateAccountPreferences).not.toHaveBeenCalled();
  });
});

describe('profile step', () => {
  it('saves a changed name, language and theme, then continues in the new language', async () => {
    renderFlow();
    fireEvent.change(screen.getByLabelText('display_name'), {
      target: { value: 'Lan N.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    fireEvent.click(screen.getByRole('button', { name: 'theme_dark' }));
    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
    click('continue');

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding?step=space', {
        locale: 'vi',
        scroll: false,
      })
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      display_name: 'Lan N.',
    });
    expect(mocks.persistLocale).toHaveBeenCalledWith('vi', 'NEXT_LOCALE');
    expect(mocks.updateProgress).toHaveBeenCalledWith({
      language_preference: 'vi',
      theme_preference: 'system',
    });
  });

  it('shows an inline alert and stays put when saving fails', async () => {
    mocks.updateProfile.mockRejectedValue(new Error('offline'));
    renderFlow();
    fireEvent.change(screen.getByLabelText('display_name'), {
      target: { value: 'Someone else' },
    });
    click('continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('save_error');
    expect(screen.getByRole('heading')).toHaveTextContent('profile_title');
  });
});

describe('step changes for assistive technology', () => {
  it('does not steal focus on first mount, then announces the step', () => {
    renderFlow();
    expect(screen.getByRole('heading')).not.toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'step_announcement:1/3:profile_title'
    );
  });

  it('moves focus to the new heading and announces it when the step changes', async () => {
    renderFlow();
    click('skip_for_now');
    const heading = await screen.findByRole('heading', { name: 'space_title' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent(
      'step_announcement:2/3:space_title'
    );
  });

  it('exposes the progress as a named progressbar with a text value', async () => {
    renderFlow({ initialStep: 'space' });
    const bar = screen.getByRole('progressbar', { name: 'progress_label' });
    expect(bar).toHaveAttribute('aria-valuemin', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuetext', 'step_of');
    expect(bar).not.toHaveAttribute('aria-hidden');
  });

  it('focuses the closing heading and makes it the main landmark', async () => {
    renderFlow({ initialStep: 'interests' });
    click('skip_for_now');
    const heading = await screen.findByRole('heading', { name: /done_title/ });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('main')).toContainElement(heading);
  });
});

describe('progress survives a language switch', () => {
  it('keeps the steps already saved when the flow remounts on a later step', async () => {
    renderFlow({ initialCompleted: ['profile'], initialStep: 'space' });
    click('continue');
    await screen.findByText('interests_title');
    expect(lastProgress()).toMatchObject({
      completed_steps: ['profile', 'space'],
      current_step: 'interests',
    });
  });

  it('keeps them through a skip too, without duplicating one', async () => {
    renderFlow({
      initialCompleted: ['profile', 'profile'],
      initialStep: 'space',
    });
    click('skip_for_now');
    await screen.findByText('interests_title');
    expect(lastProgress()).toEqual({
      completed_steps: ['profile'],
      current_step: 'interests',
    });
  });

  it('writes the same progress call as before when nothing was saved yet', async () => {
    renderFlow({ initialStep: 'space' });
    click('continue');
    await screen.findByText('interests_title');
    expect(lastProgress()).toEqual({
      completed_steps: ['space'],
      current_step: 'interests',
    });
  });
});

describe('skipping', () => {
  it('persists a skip at every step and never marks the step done', async () => {
    renderFlow();

    click('skip_for_now');
    await screen.findByText('space_title');
    expect(lastProgress()).toEqual({
      completed_steps: [],
      current_step: 'space',
    });

    click('skip_for_now');
    await screen.findByText('interests_title');
    expect(lastProgress()).toEqual({
      completed_steps: [],
      current_step: 'interests',
    });

    click('skip_for_now');
    await screen.findByText('done_title');
    expect(lastProgress()).toMatchObject({
      completed_steps: [],
      current_step: 'done',
      completed_at: expect.any(String),
    });
    expect(
      screen.getByRole('link', { name: 'go_to_workspace' })
    ).toHaveAttribute('href', '/personal');
  });

  it('skips the whole flow, records it and opens the workspace', async () => {
    renderFlow();
    click('skip_setup');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/personal'));
    expect(mocks.updateProgress).toHaveBeenCalledWith({
      dismissed_at: expect.any(String),
    });
  });

  it('still opens the workspace when recording the skip fails', async () => {
    mocks.updateProgress.mockRejectedValue(new Error('offline'));
    renderFlow();
    click('skip_setup');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/personal'));
  });
});

describe('space step', () => {
  async function chooseTeam() {
    renderFlow({ initialStep: 'space' });
    fireEvent.click(screen.getByRole('radio', { name: /with_team/ }));
    fireEvent.change(screen.getByLabelText('workspace_name'), {
      target: { value: 'Lotus Design Lab' },
    });
  }

  it('shows the workspace limit inline and does not advance', async () => {
    mocks.createWorkspace.mockResolvedValue({
      error: 'You have reached the maximum limit',
      errorCode: 'WORKSPACE_LIMIT_REACHED',
      success: false,
    });
    await chooseTeam();
    click('continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('limit_reached');
    expect(mocks.updateProgress).not.toHaveBeenCalled();
    expect(screen.getByRole('heading')).toHaveTextContent('space_title');
  });

  it('shows a generic creation failure inline', async () => {
    mocks.createWorkspace.mockResolvedValue({
      error: 'Failed to create workspace',
      success: false,
    });
    await chooseTeam();
    click('continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('create_error');
  });

  it('asks for a name before creating anything', async () => {
    renderFlow({ initialStep: 'space' });
    fireEvent.click(screen.getByRole('radio', { name: /with_team/ }));
    click('continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('name_required');
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
  });

  it('creates the workspace, invites by email and records it', async () => {
    await chooseTeam();
    const emails = screen.getByLabelText(/invite_emails/);
    fireEvent.change(emails, { target: { value: 'an@example.com' } });
    fireEvent.keyDown(emails, { key: 'Enter' });
    expect(screen.getByText('an@example.com')).toBeInTheDocument();
    click('continue');

    await screen.findByText('interests_title');
    expect(mocks.createWorkspace).toHaveBeenCalledWith('Lotus Design Lab');
    expect(mocks.inviteMembers).toHaveBeenCalledWith('ws-team', [
      'an@example.com',
    ]);
    expect(lastProgress()).toMatchObject({
      completed_steps: ['space'],
      current_step: 'interests',
      team_workspace_id: 'ws-team',
    });
  });

  it('never creates a second workspace when invites fail and the person retries', async () => {
    mocks.inviteMembers.mockResolvedValue({ successCount: 0 });
    await chooseTeam();
    const emails = screen.getByLabelText(/invite_emails/);
    fireEvent.change(emails, { target: { value: 'an@example.com' } });
    fireEvent.keyDown(emails, { key: 'Enter' });
    click('continue');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invites_failed'
    );

    click('continue');
    await screen.findByText('interests_title');
    expect(mocks.createWorkspace).toHaveBeenCalledTimes(1);
  });

  it('joins a pending invitation through the invite API', async () => {
    mocks.listInvitations.mockResolvedValue({
      invitations: [
        {
          workspace: { id: 'ws-9', name: 'Sunrise Studio', personal: false },
        },
      ],
    });
    renderFlow({ initialStep: 'space' });
    fireEvent.click(await screen.findByRole('button', { name: 'join' }));
    await waitFor(() =>
      expect(mocks.acceptInvite).toHaveBeenCalledWith('ws-9')
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').map((node) => node.textContent)
      ).toContain('joined')
    );
  });

  it('uses the shared radio group, so the radio keyboard pattern applies', () => {
    renderFlow({ initialStep: 'space' });
    const group = screen.getByRole('radiogroup', { name: 'workspace_group' });
    const [solo, team] = screen.getAllByRole('radio');
    expect(group).toHaveAttribute('data-slot', 'radio-group');
    expect(group).toContainElement(solo ?? null);
    expect(group).toContainElement(team ?? null);
    expect(solo).toHaveAttribute('aria-checked', 'true');
    expect(team).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(team as HTMLElement);
    expect(team).toHaveAttribute('aria-checked', 'true');
    expect(solo).toHaveAttribute('aria-checked', 'false');
  });
});

describe('interests step', () => {
  it('saves the picks as journey goals and finishes the flow', async () => {
    renderFlow({ initialStep: 'interests' });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /interest_calendar_label/ })
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /interest_finance_label/ })
    );
    click('finish');

    await screen.findByText('done_title');
    expect(mocks.updateProgress).toHaveBeenCalledWith({
      goals: ['focus', 'operate'],
    });
    expect(lastProgress()).toMatchObject({
      completed_at: expect.any(String),
      completed_steps: ['interests'],
      current_step: 'done',
    });
    expect(mocks.updateUserConfig).not.toHaveBeenCalled();
  });

  it('maps Teach or learn to the education audience mode when none is set', async () => {
    renderFlow({ initialStep: 'interests' });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /interest_education_label/ })
    );
    click('finish');
    await screen.findByText('done_title');
    expect(mocks.updateProgress).toHaveBeenCalledWith({ goals: ['learn'] });
    expect(mocks.updateUserConfig).toHaveBeenCalledWith(
      'MOBILE_AUDIENCE_MODE',
      'education'
    );
  });

  it('keeps an audience mode the person already chose', async () => {
    mocks.getUserConfig.mockResolvedValue({ value: 'general' });
    renderFlow({ initialStep: 'interests' });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /interest_education_label/ })
    );
    click('finish');
    await screen.findByText('done_title');
    expect(mocks.updateUserConfig).not.toHaveBeenCalled();
  });

  it('changes no goals when nothing is picked', async () => {
    renderFlow({ initialStep: 'interests' });
    click('finish');
    await screen.findByText('done_title');
    expect(mocks.updateProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ goals: expect.anything() })
    );
  });
});
