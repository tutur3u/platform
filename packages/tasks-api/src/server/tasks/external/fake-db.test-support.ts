import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * A small in-memory stand-in for the Supabase query builder. It understands
 * the filters the task comment, link and timeline handlers use and keeps
 * `private.*` tables apart from public ones. Unique-index violations surface
 * as a 23505 error so race paths can be exercised.
 */
export class FakeDb {
  tables = new Map<string, Row[]>();
  uniques = new Map<string, (row: Row, rows: Row[]) => boolean>();
  schemaName = 'public';

  seed(table: string, rows: Row[]) {
    this.tables.set(
      table,
      rows.map((row) => ({ ...row }))
    );
    return this;
  }

  rows(table: string) {
    return this.tables.get(table) ?? [];
  }

  schema(name: string) {
    const scoped = Object.create(this) as FakeDb;
    scoped.schemaName = name;
    return scoped;
  }

  from(table: string) {
    const key =
      this.schemaName === 'public' ? table : `${this.schemaName}.${table}`;
    if (!this.tables.has(key)) this.tables.set(key, []);
    return new Query(this, key);
  }
}

class Query implements PromiseLike<{
  data: unknown;
  error: unknown;
  count?: number;
}> {
  private filters: Filter[] = [];
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' =
    'select';
  private payload: Row | Row[] = {};
  private max: number | null = null;
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private upsertOptions: { ignoreDuplicates?: boolean } = {};

  constructor(
    private db: FakeDb,
    private key: string
  ) {}

  select() {
    return this;
  }
  insert(payload: Row | Row[]) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], options: { ignoreDuplicates?: boolean } = {}) {
    this.action = 'upsert';
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }
  update(payload: Row) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.action = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  not(column: string, _op: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  or() {
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy.push({ column, ascending: options.ascending !== false });
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }

  private matching() {
    let rows = this.db
      .rows(this.key)
      .filter((row) => this.filters.every((f) => f(row)));
    for (const { column, ascending } of [...this.orderBy].reverse()) {
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return (
          (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1)
        );
      });
    }
    return this.max === null ? rows : rows.slice(0, this.max);
  }

  private execute(): { data: unknown; error: unknown } {
    const table = this.db.rows(this.key);
    if (this.action === 'select') return { data: this.matching(), error: null };
    if (this.action === 'insert' || this.action === 'upsert') {
      const inserted: Row[] = [];
      for (const item of Array.isArray(this.payload)
        ? this.payload
        : [this.payload]) {
        const row: Row = {
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...item,
        };
        const unique = this.db.uniques.get(this.key);
        if (unique?.(row, table)) {
          if (this.action === 'upsert' && this.upsertOptions.ignoreDuplicates)
            continue;
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          };
        }
        table.push(row);
        inserted.push(row);
      }
      return { data: inserted, error: null };
    }
    const hit = this.matching();
    if (this.action === 'update') {
      const defined = Object.fromEntries(
        Object.entries(this.payload).filter(([, value]) => value !== undefined)
      );
      for (const row of hit) Object.assign(row, defined);
      return { data: hit, error: null };
    }
    this.db.tables.set(
      this.key,
      table.filter((row) => !hit.includes(row))
    );
    return { data: hit, error: null };
  }

  single() {
    const { data, error } = this.execute();
    const rows = (data as Row[]) ?? [];
    return Promise.resolve(
      error
        ? { data: null, error }
        : rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'no rows' } }
    );
  }
  maybeSingle() {
    const { data, error } = this.execute();
    const rows = (data as Row[]) ?? [];
    return Promise.resolve({ data: error ? null : (rows[0] ?? null), error });
  }
  then<T1, T2>(
    onfulfilled?: (value: {
      data: unknown;
      error: unknown;
    }) => T1 | PromiseLike<T1>,
    onrejected?: (reason: unknown) => T2 | PromiseLike<T2>
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
