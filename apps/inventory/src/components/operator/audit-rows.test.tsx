import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuditRows } from './audit-rows';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'audit.systemActor') return 'System';
    if (key === 'audit.changedFields') {
      return `${params?.count ?? 0} fields changed`;
    }
    if (key === 'empty') return 'No inventory records match this view.';
    return key;
  },
}));

describe('AuditRows', () => {
  it('renders camelCase audit records without undefined fallbacks', () => {
    const html = renderToStaticMarkup(
      <AuditRows
        rows={[
          {
            actor: {
              authUid: null,
              displayName: null,
              workspaceUserId: null,
            },
            after: { name: 'Fuel' },
            auditRecordId: 'audit-1',
            before: {},
            changedFields: ['name'],
            entityId: 'unit-1',
            entityKind: 'unit',
            entityLabel: 'Fuel',
            eventKind: 'created',
            fieldChanges: [
              {
                after: 'Fuel',
                before: null,
                field: 'name',
                label: 'name',
              },
            ],
            occurredAt: '2026-06-12T10:00:00.000Z',
            source: 'inventory',
            summary: 'Created unit Fuel',
          },
        ]}
      />
    );

    expect(html).toContain('Created unit Fuel');
    expect(html).toContain('Created');
    expect(html).toContain('Unit');
    expect(html).toContain('System');
    expect(html).not.toContain('undefined');
  });
});
