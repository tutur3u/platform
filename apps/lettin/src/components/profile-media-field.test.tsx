// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { ProfileMediaField } from './profile-media-field';

const state = vi.hoisted(() => ({ locale: 'en', upload: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {},
}));
vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  uploadCurrentUserProfileMedia: state.upload,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = state.locale === 'vi' ? vietnamese.lettin : en.lettin;
    return messages[key as keyof typeof messages] ?? key;
  },
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  state.locale = 'en';
  state.upload.mockReset();
});

for (const locale of ['en', 'vi']) {
  it(`gives avatar and banner exact labels with separate upload descriptions in ${locale}`, async () => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    await act(() =>
      root.render(
        (['avatar', 'banner'] as const).map((kind) => (
          <ProfileMediaField
            key={kind}
            kind={kind}
            disabled={false}
            hasImage={false}
            onPending={vi.fn()}
            onChange={vi.fn()}
          />
        ))
      )
    );
    const inputs =
      container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.id).not.toBe(inputs[1]?.id);
    for (const [index, kind] of (['avatar', 'banner'] as const).entries()) {
      const input = inputs[index]!;
      expect(input.labels).toHaveLength(1);
      expect(input.labels?.[0]?.textContent).toBe(
        messages[kind === 'avatar' ? 'profileavatar_url' : 'profilebanner_url']
      );
      expect(
        document.getElementById(input.getAttribute('aria-describedby')!)
          ?.textContent
      ).toBe(
        messages[kind === 'avatar' ? 'avatarUploadHint' : 'bannerUploadHint']
      );
    }
  });
}

it('uploads a selected banner and publishes its resulting URL', async () => {
  const onPending = vi.fn();
  const onChange = vi.fn();
  state.upload.mockResolvedValue('https://images.example/banner.webp');
  await act(() =>
    root.render(
      <ProfileMediaField
        kind="banner"
        disabled={false}
        hasImage={false}
        onPending={onPending}
        onChange={onChange}
      />
    )
  );
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(['synthetic-image'], 'banner.png', {
    type: 'image/png',
  });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event('change', { bubbles: true }))
  );
  expect(state.upload).toHaveBeenCalledWith('banner', file);
  expect(onChange).toHaveBeenCalledWith('https://images.example/banner.webp');
  expect(onPending.mock.calls).toEqual([[true], [false]]);
});
