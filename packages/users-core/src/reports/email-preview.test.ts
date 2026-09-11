import { describe, expect, it } from 'vitest';
import { loadReportEmailPreview } from './email-preview';

function database(missing = false, configError = false) {
  const calls: Array<[string, string, unknown[]]> = [];
  const from = (table: string) => {
    const data =
      table === 'workspace_configs'
        ? [
            { id: 'BRAND_NAME', value: 'Easy Center' },
            {
              id: 'REPORT_INTRO',
              value: '{{user_name}} · {{group_name}} · {{group_manager_name}}',
            },
          ]
        : missing
          ? null
          : {
              title: 'August',
              content: 'Learning',
              feedback: 'Feedback',
              score: 0,
              user_full_name: 'Learner',
              group_name: 'Class',
              creator_full_name: 'Teacher',
              user_email: 'learner@example.com',
            };
    const proxy = new Proxy(
      {},
      {
        get(_, property) {
          if (property === 'then')
            return Promise.resolve({
              data,
              error:
                configError && table === 'workspace_configs'
                  ? new Error('Config failed')
                  : null,
            }).then.bind(
              Promise.resolve({
                data,
                error:
                  configError && table === 'workspace_configs'
                    ? new Error('Config failed')
                    : null,
              })
            );
          return (...args: unknown[]) => {
            calls.push([table, String(property), args]);
            return proxy;
          };
        },
      }
    );
    return proxy;
  };
  return { client: { from, schema: () => ({ from }) }, calls };
}
describe('workspace-scoped email preview', () => {
  it('applies explicit workspace and report filters to both queries', async () => {
    const { client, calls } = database();
    const preview = await loadReportEmailPreview(
      client as never,
      'workspace',
      'report'
    );
    expect(calls).toContainEqual([
      'external_user_monthly_reports_workspace_view',
      'eq',
      ['user_ws_id', 'workspace'],
    ]);
    expect(calls).toContainEqual([
      'external_user_monthly_reports_workspace_view',
      'eq',
      ['id', 'report'],
    ]);
    expect(calls).toContainEqual([
      'workspace_configs',
      'eq',
      ['ws_id', 'workspace'],
    ]);
    expect(preview.recipient).toBe('learner@example.com');
    expect(preview.html).toContain('<strong>Learner</strong>');
    expect(preview.html).toContain('0.0');
    expect(preview.html).toContain('Easy Center');
  });
  it('fails closed for absent reports and failed template reads', async () => {
    await expect(
      loadReportEmailPreview(
        database(true).client as never,
        'workspace',
        'report'
      )
    ).rejects.toThrow('Report not found');
    await expect(
      loadReportEmailPreview(
        database(false, true).client as never,
        'workspace',
        'report'
      )
    ).rejects.toThrow('Config failed');
  });
});
