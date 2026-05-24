import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPanel } from './topic-announcements-import';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

const defaultProps = {
  canSend: true,
  importResult: null,
  isImporting: false,
  isSending: false,
  onImport: vi.fn(),
  onImportAndSend: vi.fn(),
};

describe('ImportPanel', () => {
  it('lets operators edit rows directly and create drafts from valid rows', () => {
    const onImport = vi.fn();

    render(<ImportPanel {...defaultProps} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('email 1'), {
      target: { value: 'ready@example.com' },
    });
    fireEvent.change(screen.getByLabelText('topic 1'), {
      target: { value: 'Ready topic' },
    });
    fireEvent.change(screen.getByLabelText('announcement_title 1'), {
      target: { value: 'Ready title' },
    });

    expect(screen.getByText('import_ready')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /bulk_create_drafts/u })
    );

    expect(onImport).toHaveBeenCalledWith({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('loads CSV into the editable grid and can create then send', () => {
    const onImportAndSend = vi.fn();

    render(<ImportPanel {...defaultProps} onImportAndSend={onImportAndSend} />);

    fireEvent.change(screen.getByLabelText('paste_csv'), {
      target: {
        value: [
          'email,topic,title',
          'ready@example.com,Ready topic,Ready title',
          'missing-topic@example.com,,Missing topic title',
          ',Needs email,Missing email title',
        ].join('\n'),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /bulk_load_csv/u }));

    expect(screen.getByDisplayValue('ready@example.com')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_topic')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_email')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /bulk_create_and_send/u })
    );

    expect(onImportAndSend).toHaveBeenCalledWith({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });
});
