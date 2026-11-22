// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthRecoveryView } from './recovery-view';

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  consumeAuthRecoveryWithInternalApi: mocks.consume,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('explains an expired link with a copyable reference, then offers the code form', async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  render(
    <AuthRecoveryView
      defaultEmail=""
      diagnosticCode="AUTH-RECOVERY-1A2B3C"
      error="invalid"
      locale="vi"
    />
  );

  expect(
    screen.getByRole('heading', { level: 1, name: 'link_expired_title' })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'back_to_sign_in' })).toHaveAttribute(
    'href',
    '/vi/login'
  );
  fireEvent.click(screen.getByRole('button', { name: 'copy_reference' }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith('AUTH-RECOVERY-1A2B3C')
  );

  fireEvent.click(screen.getByRole('button', { name: 'enter_code_instead' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'title' })
  ).toBeInTheDocument();
  expect(await screen.findByLabelText('code_label')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('submits the same recovery request and shows a failure as an alert', async () => {
  mocks.consume.mockResolvedValue({ error: 'Code rejected', success: false });
  render(<AuthRecoveryView defaultEmail="person@example.com" locale="en" />);

  const submit = screen.getByRole('button', { name: 'submit' });
  expect(submit).toBeDisabled();
  fireEvent.change(await screen.findByLabelText('code_label'), {
    target: { value: '123456' },
  });
  fireEvent.click(submit);

  await waitFor(() =>
    expect(mocks.consume).toHaveBeenCalledWith({
      code: '123456',
      email: 'person@example.com',
      locale: 'en',
      next: undefined,
    })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Code rejected');
});
