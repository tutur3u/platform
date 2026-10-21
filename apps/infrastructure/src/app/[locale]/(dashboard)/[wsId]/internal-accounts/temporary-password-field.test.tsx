import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemporaryPasswordField } from './temporary-password-field';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

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
