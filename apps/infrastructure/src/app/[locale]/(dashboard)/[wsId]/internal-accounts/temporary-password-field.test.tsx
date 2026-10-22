import {
  act,
  fireEvent,
  render as renderView,
  screen,
} from '@testing-library/react';
import { EmployeeCreationPasswordSchema } from '@tuturuuu/internal-api/infrastructure';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactElement, type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import viMessages from '../../../../../../messages/vi.json';
import { AccountPasswordResetDialog } from './account-password-reset-dialog';
import { InternalAccountActionDialog } from './internal-account-action-dialog';
import { TemporaryPasswordField } from './temporary-password-field';

function TranslationContext({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}
function render(ui: ReactElement) {
  return renderView(ui, { wrapper: TranslationContext });
}

const language = vi.hoisted(() => ({ real: false }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: string) => {
      const translate = actual.useTranslations(namespace);
      return language.real ? translate : (key: string) => key;
    },
  };
});

function ControlledField() {
  const [value, setValue] = useState('Synthetic-password-123!');
  return (
    <TemporaryPasswordField
      id="password"
      minLength={12}
      value={value}
      onChange={setValue}
    />
  );
}

beforeEach(() => {
  language.real = false;
});

const reset = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  resetAccountPassword: reset,
}));

const copy = () =>
  fireEvent.click(screen.getByRole('button', { name: 'copy_password' }));
const failure = () => screen.queryByRole('alert');

describe('temporary password clipboard feedback', () => {
  const writeText = vi.fn();
  beforeEach(() => {
    writeText.mockReset();
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['manual', 'generate'])(
    'clears a failed copy after %s replacement',
    async (replacement) => {
      writeText.mockRejectedValue(new Error('Synthetic clipboard failure'));
      render(<ControlledField />);
      await act(async () => copy());
      expect(failure()).toHaveTextContent('copy_password_failed');
      if (replacement === 'manual') {
        fireEvent.change(screen.getByLabelText('new_password'), {
          target: { value: 'Replacement-password-234!' },
        });
      } else {
        fireEvent.click(
          screen.getByRole('button', { name: 'generate_password' })
        );
      }
      expect(failure()).not.toBeInTheDocument();
    }
  );

  it('clears a failed copy when the owner clears or replaces the controlled value', async () => {
    writeText.mockRejectedValue(new Error('Synthetic clipboard failure'));
    const props = { id: 'password', minLength: 12, onChange: vi.fn() };
    const view = render(
      <TemporaryPasswordField {...props} value="Synthetic-password-123!" />
    );
    await act(async () => copy());
    expect(failure()).toBeInTheDocument();
    view.rerender(<TemporaryPasswordField {...props} value="" />);
    expect(failure()).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'copy_password' })
    ).toBeDisabled();
    view.rerender(
      <TemporaryPasswordField {...props} value="Replacement-password-234!" />
    );
    expect(failure()).not.toBeInTheDocument();
  });

  it.each(['replacement', 'unmount', 'retry'])(
    'ignores an old rejection after %s',
    async (change) => {
      let rejectOld: (reason: Error) => void = () => {
        throw new Error('No pending copy');
      };
      writeText.mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectOld = reject;
          })
      );
      writeText.mockResolvedValue(undefined);
      const view = render(<ControlledField />);
      copy();
      if (change === 'replacement') {
        fireEvent.change(screen.getByLabelText('new_password'), {
          target: { value: 'Replacement-password-234!' },
        });
      } else if (change === 'unmount') {
        view.unmount();
      } else {
        await act(async () => copy());
      }
      await act(async () => rejectOld(new Error('Synthetic old rejection')));
      expect(failure()).not.toBeInTheDocument();
    }
  );

  it('reports the current failure and clears it after a successful explicit retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Synthetic current rejection'));
    writeText.mockResolvedValue(undefined);
    render(<ControlledField />);
    await act(async () => copy());
    expect(failure()).toHaveTextContent('copy_password_failed');
    await act(async () => copy());
    expect(failure()).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});

describe('secure temporary password generation', () => {
  it.each(['hidden', 'visible'])(
    'keeps the previous secret and %s visibility when entropy fails',
    (visibility) => {
      render(<ControlledField />);
      const input = screen.getByLabelText('new_password');
      if (visibility === 'visible')
        fireEvent.click(screen.getByRole('button', { name: 'show_password' }));
      const entropy = vi
        .spyOn(crypto, 'getRandomValues')
        .mockImplementation(() => {
          throw new Error('PRIVATE entropy failure');
        });
      try {
        fireEvent.click(
          screen.getByRole('button', { name: 'generate_password' })
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
          'generate_password_failed'
        );
        expect(input).toHaveValue('Synthetic-password-123!');
        expect(input).toHaveAttribute(
          'type',
          visibility === 'visible' ? 'text' : 'password'
        );
        fireEvent.change(input, { target: { value: 'Manual-Password-123!' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        entropy.mockRestore();
      }
    }
  );
  it('generates a shared-schema-valid password after an entropy failure', () => {
    render(<ControlledField />);
    const entropy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce(() => {
        throw new Error('Entropy failed');
      });
    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'generate_password' })
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'generate_password_failed'
      );
      entropy.mockRestore();
      fireEvent.click(
        screen.getByRole('button', { name: 'generate_password' })
      );
      const input = screen.getByLabelText<HTMLInputElement>('new_password');
      expect(
        EmployeeCreationPasswordSchema.safeParse(input.value).success
      ).toBe(true);
      expect(input).toHaveAttribute('type', 'text');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      entropy.mockRestore();
    }
  });
  it.each(['row reset', 'reset any account'])(
    'keeps %s usable for manual entry after entropy failure without mutation',
    (flow) => {
      const confirm = vi.fn();
      reset.mockClear();
      if (flow === 'row reset')
        render(
          <InternalAccountActionDialog
            open
            action="reset_password"
            account={{
              id: '10000000-0000-4000-8000-000000000001',
              email: 'staff@tuturuuu.com',
              displayName: 'Staff',
              username: null,
              isDisabled: false,
              isSelf: false,
              createdAt: '2026-10-01T00:00:00Z',
              emailConfirmedAt: null,
              lastSignInAt: null,
              personalWorkspaceId: null,
              storageLimitBytes: null,
              storageUsedBytes: null,
              bannedUntil: null,
            }}
            onConfirm={confirm}
            onOpenChange={vi.fn()}
          />
        );
      else render(<AccountPasswordResetDialog open onOpenChange={vi.fn()} />);
      const entropy = vi
        .spyOn(crypto, 'getRandomValues')
        .mockImplementation(() => {
          throw new Error('Entropy failed');
        });
      try {
        fireEvent.click(
          screen.getByRole('button', { name: 'generate_password' })
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
          'generate_password_failed'
        );
        expect(screen.getByLabelText('new_password')).toHaveValue('');
        fireEvent.change(screen.getByLabelText('new_password'), {
          target: { value: 'Manual-Password-123!' },
        });
        expect(screen.getByLabelText('new_password')).toHaveValue(
          'Manual-Password-123!'
        );
        expect(confirm).not.toHaveBeenCalled();
        expect(reset).not.toHaveBeenCalled();
      } finally {
        entropy.mockRestore();
      }
    }
  );
});

it.each(['en', 'vi'] as const)(
  'renders actionable manual generation guidance in %s',
  (locale) => {
    language.real = true;
    const labels = (locale === 'en' ? en : viMessages)['internal-accounts']
      .dialog;
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? en : viMessages}
      >
        <ControlledField />
      </NextIntlClientProvider>
    );
    const entropy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(() => {
        throw new Error('PRIVATE entropy failure');
      });
    try {
      fireEvent.click(
        screen.getByRole('button', { name: labels.generate_password })
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        labels.generate_password_failed
      );
      expect(
        screen.queryByText('PRIVATE entropy failure')
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(labels.new_password)).toHaveValue(
        'Synthetic-password-123!'
      );
    } finally {
      entropy.mockRestore();
    }
  }
);
