// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { CreatorProfileEditor } from './creator-profile-editor';

const state = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      id: 'synthetic-profile',
      display_name: 'Writer',
      handle: 'writer_one',
    },
    isPending: false,
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {},
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserProfile: vi.fn(),
  updateCurrentUserProfile: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = state.locale === 'vi' ? vietnamese.lettin : en.lettin;
    return messages[key as keyof typeof messages] ?? key;
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('./navigation-guard', () => ({
  useNavigationGuard: () => ({ dirty: true, setDirty: vi.fn() }),
}));
vi.mock('./creator-about-editor', () => ({ CreatorAboutEditor: () => null }));
vi.mock('./creator-profile-header', () => ({
  CreatorProfileHeader: () => null,
}));
vi.mock('./profile-media-field', () => ({ ProfileMediaField: () => null }));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  state.locale = 'en';
});
for (const locale of ['en', 'vi']) {
  it(`keeps exact editable field labels separate from help in ${locale}`, async () => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    await act(() =>
      root.render(
        <CreatorProfileEditor
          wsId="workspace"
          canEditAbout={false}
          hasPublishedWorlds={false}
        />
      )
    );
    const inputs = [...container.querySelectorAll('input')];
    const username = inputs.find((input) => input.value === 'writer_one')!;
    const displayName = inputs.find((input) => input.value === 'Writer')!;
    expect(
      [...username.labels!].map((label) => label.textContent?.trim())
    ).toEqual([messages.profilehandle]);
    expect(
      [...displayName.labels!].map((label) => label.textContent?.trim())
    ).toEqual([messages.profiledisplay_name]);
    const hint = document.getElementById(
      username.getAttribute('aria-describedby')!
    );
    expect(hint?.textContent).toBe(messages.usernameHint);
    expect(username.disabled).toBe(false);
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(username, 'google');
      username.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === messages.saveProfile
    )!;
    expect(save.disabled).toBe(true);
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(username, 'synthetic_writer');
      username.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(save.disabled).toBe(false);
  });
}
