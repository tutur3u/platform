import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RandomCryptoSource } from './random-generator';
import RandomGeneratorClient from './random-generator-client';

const translations = {
  'actions.copied': 'Copied {label}',
  'actions.copy': 'Copy',
  'actions.copy_all': 'Copy all',
  'actions.regenerate': 'Regenerate',
  description: 'Generate ids, tokens, and passwords in your browser.',
  eyebrow: 'Browser local',
  'errors.clipboard_failed': 'Clipboard failed.',
  'errors.no_secure_crypto': 'Secure random generation is unavailable.',
  'errors.select_password_class': 'Select at least one character set.',
  'fields.batch_count': 'Batch count',
  'fields.byte_length': 'Byte length',
  'fields.character_sets': 'Character sets',
  'fields.exclude_ambiguous': 'Exclude ambiguous characters',
  'fields.id_format': 'ID format',
  'fields.length': 'Length',
  'fields.lowercase': 'Lowercase',
  'fields.numbers': 'Numbers',
  'fields.password_length': 'Password length',
  'fields.prefix': 'Prefix',
  'fields.symbols': 'Symbols',
  'fields.token_format': 'Token format',
  'fields.uppercase': 'Uppercase',
  'formats.api_key': 'API key',
  'formats.base64url': 'Base64url',
  'formats.hex': 'Hex',
  'formats.nanoid': 'NanoID-style',
  'formats.uuid': 'UUID v4',
  'helpers.exclude_ambiguous': 'Avoid 0, O, 1, I, l, and similar marks.',
  'kinds.id': 'ID',
  'kinds.password': 'Password',
  'kinds.token': 'Token',
  'kinds.uuid': 'UUID',
  'outputs.copy_value': 'Copy value {index}',
  'outputs.description': 'Fresh values generated locally.',
  'outputs.empty': 'No values yet.',
  'outputs.entropy_bits': '{bits} bits',
  'outputs.generated_value': 'Generated value {index}',
  'outputs.title': 'Generated values',
  privacy_note: 'Values are generated locally and are not stored.',
  'tabs.ids': 'IDs',
  'tabs.passwords': 'Passwords',
  'tabs.tokens': 'Tokens',
  title: 'Secure random generator',
} as const;

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      let value: string = translations[key as keyof typeof translations] ?? key;

      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{${name}}`, String(replacement));
      }

      return value;
    },
}));

function createCryptoSource(bytes: number[]): RandomCryptoSource {
  let byteIndex = 0;
  let uuidIndex = 0;

  return {
    getRandomValues<T extends Uint8Array>(array: T) {
      for (let index = 0; index < array.length; index++) {
        array[index] = bytes[byteIndex % bytes.length] ?? 0;
        byteIndex += 1;
      }

      return array;
    },
    randomUUID: () => {
      uuidIndex += 1;
      return `11111111-2222-4333-8444-${String(uuidIndex).padStart(12, '0')}`;
    },
  };
}

function openTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.mouseUp(tab);
  fireEvent.click(tab);
}

describe('RandomGeneratorClient', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>(
    async () => undefined
  );

  beforeEach(() => {
    vi.stubGlobal(
      'crypto',
      createCryptoSource(Array.from({ length: 256 }, (_, index) => index))
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates useful id values by default', async () => {
    render(<RandomGeneratorClient />);

    const firstValue = await screen.findByLabelText('Generated value 1');

    expect((firstValue as HTMLTextAreaElement).value).toMatch(
      /^[A-Za-z0-9_-]{21}$/u
    );
    expect(screen.getAllByText('126 bits')).toHaveLength(5);
  });

  it('regenerates when switching to token output', async () => {
    render(<RandomGeneratorClient />);

    openTab(/Tokens/u);

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Generated value 1') as HTMLTextAreaElement)
          .value
      ).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    });
    expect(screen.getAllByText('256 bits')).toHaveLength(5);
  });

  it('regenerates when an option changes', async () => {
    render(<RandomGeneratorClient />);

    await screen.findByLabelText('Generated value 1');
    fireEvent.change(screen.getByLabelText('Length'), {
      target: { value: '8' },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Generated value 1') as HTMLTextAreaElement)
          .value
      ).toMatch(/^[A-Za-z0-9_-]{8}$/u);
    });
  });

  it('copies one value and all generated values', async () => {
    render(<RandomGeneratorClient />);

    const firstValue = await screen.findByLabelText('Generated value 1');
    fireEvent.click(screen.getByRole('button', { name: 'Copy value 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenNthCalledWith(
      1,
      (firstValue as HTMLTextAreaElement).value
    );
    expect(writeText.mock.calls[1]?.[0]).toContain('\n');
  });

  it('disables generation when every password class is off', async () => {
    render(<RandomGeneratorClient />);

    openTab(/Passwords/u);
    await waitFor(() =>
      expect(screen.getByLabelText('Uppercase')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText('Uppercase'));
    fireEvent.click(screen.getByLabelText('Lowercase'));
    fireEvent.click(screen.getByLabelText('Numbers'));
    fireEvent.click(screen.getByLabelText('Symbols'));

    expect(
      await screen.findByText('Select at least one character set.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  });
});
