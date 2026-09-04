import { describe, expect, it, vi } from 'vitest';
import { upsertFormRow } from './mutations';

type UpsertResult = { error: { code?: string; message: string } | null };

function createClient(results: UpsertResult[]) {
  const calls: Record<string, unknown>[] = [];
  const upsert = vi.fn((payload: Record<string, unknown>) => {
    calls.push(payload);
    return Promise.resolve(results[calls.length - 1] ?? { error: null });
  });

  return {
    calls,
    upsert,
    client: { from: () => ({ upsert }) },
  };
}

const payload = { id: 'form-1', title: 'Intake', seo: { title: 'Custom' } };

describe('upsertFormRow', () => {
  it('writes once when the schema has the column', async () => {
    const { client, calls } = createClient([{ error: null }]);

    const result = await upsertFormRow(client, payload);

    expect(result.error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveProperty('seo');
  });

  it('retries without seo when the column does not exist yet', async () => {
    // Production migrations apply after the deployment, so this is the window
    // on every release where the new code meets the old schema.
    const { client, calls } = createClient([
      {
        error: {
          code: '42703',
          message: `column "seo" of relation "forms" does not exist`,
        },
      },
      { error: null },
    ]);

    const result = await upsertFormRow(client, payload);

    expect(result.error).toBeNull();
    expect(calls).toHaveLength(2);
    // The author's edit still lands; only the SEO overrides are dropped, and
    // only until the migration is applied.
    expect(calls[1]).not.toHaveProperty('seo');
    expect(calls[1]).toMatchObject({ id: 'form-1', title: 'Intake' });
  });

  it('does not retry when a different column is missing', async () => {
    // A genuinely missing column is a bug and must surface rather than be
    // silently papered over by dropping an unrelated field.
    const { client, calls } = createClient([
      {
        error: {
          code: '42703',
          message: `column "closed_at" of relation "forms" does not exist`,
        },
      },
    ]);

    const result = await upsertFormRow(client, payload);

    expect(result.error?.code).toBe('42703');
    expect(calls).toHaveLength(1);
  });

  it('does not retry on an unrelated failure', async () => {
    const { client, calls } = createClient([
      { error: { code: '23505', message: 'duplicate key value' } },
    ]);

    const result = await upsertFormRow(client, payload);

    expect(result.error?.code).toBe('23505');
    expect(calls).toHaveLength(1);
  });

  it('does not retry when the payload never carried seo', async () => {
    const { client, calls } = createClient([
      {
        error: {
          code: '42703',
          message: `column "seo" of relation "forms" does not exist`,
        },
      },
    ]);

    const result = await upsertFormRow(client, { id: 'form-1' });

    expect(result.error?.code).toBe('42703');
    expect(calls).toHaveLength(1);
  });
});
