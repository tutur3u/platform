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

describe('ImportPanel', () => {
  it('previews CSV fallback rows and imports only valid rows', () => {
    const onImport = vi.fn();

    render(
      <ImportPanel
        importResult={null}
        isImporting={false}
        onImport={onImport}
      />
    );

    expect(screen.getByText('import_empty_preview')).toBeInTheDocument();

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

    expect(screen.getByText('ready@example.com')).toBeInTheDocument();
    expect(screen.getByText('import_ready')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_topic')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_email')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /import_rows/u }));

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
});
