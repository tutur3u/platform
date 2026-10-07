// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../../lettin/messages/en.json';
import vietnamese from '../../../lettin/messages/vi.json';
import { ProfileMediaField } from '../../../lettin/src/components/profile-media-field';

const state = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  uploadCurrentUserProfileMedia: vi.fn(),
}));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = state.locale === 'vi' ? vietnamese.lettin : en.lettin;
    return messages[key as keyof typeof messages];
  },
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));

for (const locale of ['en', 'vi']) {
  for (const kind of ['avatar', 'banner'] as const) {
    it(`exposes the exact ${kind} label and separate description in ${locale}`, async () => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      state.locale = locale;
      const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(
            <ProfileMediaField
              kind={kind}
              disabled={false}
              hasImage={false}
              onPending={vi.fn()}
              onChange={vi.fn()}
            />
          )
        );
        const input = container.querySelector('input')!;
        expect(input.labels?.[0]?.textContent?.trim()).toBe(
          messages[
            kind === 'avatar' ? 'profileavatar_url' : 'profilebanner_url'
          ]
        );
        const hint = document.getElementById(
          input.getAttribute('aria-describedby')!
        );
        expect(hint?.textContent).toBe(
          messages[kind === 'avatar' ? 'avatarUploadHint' : 'bannerUploadHint']
        );
        expect(input.disabled).toBe(false);
      } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
      }
    });
  }
}
