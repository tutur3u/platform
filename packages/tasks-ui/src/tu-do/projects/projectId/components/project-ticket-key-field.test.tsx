import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTicketKeyField } from './project-ticket-key-field';

function field(value: string, onChange = vi.fn()) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        task_project_detail: {
          configuration: {
            key_label: 'Key',
            key_preview: 'Preview: {identifier}',
            key_invalid: 'Invalid key',
          },
        },
      }}
    >
      <ProjectTicketKeyField value={value} onChange={onChange} />
    </NextIntlClientProvider>
  );
}

describe('ProjectTicketKeyField', () => {
  it('shows the ticket preview and uppercases edits', () => {
    const onChange = vi.fn();
    field('PLA', onChange);
    expect(screen.getByText('Preview: PLA-12')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Key'), {
      target: { value: 'core' },
    });
    expect(onChange).toHaveBeenCalledWith('CORE');
  });
  it('associates validation with the input', () => {
    field('1BAD');
    expect(screen.getByLabelText('Key')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByText('Invalid key')).toHaveAttribute(
      'id',
      'project-ticket-key-hint'
    );
  });
});
