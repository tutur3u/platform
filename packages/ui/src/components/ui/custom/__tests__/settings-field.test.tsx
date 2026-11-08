import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsField } from '../settings-field';

describe('SettingsField', () => {
  it('labels its control and connects help text', () => {
    render(
      <SettingsField label="Display name" description="Visible to your team">
        {(props) => <input {...props} />}
      </SettingsField>
    );
    const input = screen.getByRole('textbox', { name: 'Display name' });
    expect(input).toHaveAccessibleDescription('Visible to your team');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('retains the draft and updates the error association on validation', () => {
    const { rerender } = render(
      <SettingsField
        id="name"
        label="Name"
        validation={{ kind: 'invalid', message: 'Name is required' }}
      >
        {(props) => <input {...props} defaultValue="draft" />}
      </SettingsField>
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveValue('draft');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Name is required');
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    rerender(
      <SettingsField id="name" label="Name" validation={{ kind: 'valid' }}>
        {(props) => <input {...props} defaultValue="draft" />}
      </SettingsField>
    );
    expect(input).toHaveValue('draft');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('combines help and error without mixing identifiers across fields', () => {
    render(
      <>
        <SettingsField
          label="First"
          description="Help"
          validation={{ kind: 'invalid', message: 'Required' }}
        >
          {(props) => <input {...props} />}
        </SettingsField>
        <SettingsField label="Second">
          {(props) => <input {...props} disabled />}
        </SettingsField>
      </>
    );
    const first = screen.getByRole('textbox', { name: 'First' });
    const second = screen.getByRole('textbox', { name: 'Second' });
    expect(first).toHaveAccessibleDescription('Help Required');
    expect(first.id).not.toBe(second.id);
    expect(second).toBeDisabled();
    expect(second).not.toHaveAttribute('aria-describedby');
  });
});
