/**
 * Postgres and PostgREST codes for a table, column or function that does not
 * exist. Mail can deploy before the migration adding the objects a feature
 * reads, so such a read degrades to "feature unavailable" instead of failing.
 */
const MISSING_SCHEMA_CODES = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42883', // undefined_function
  'PGRST202', // function not in the schema cache
  'PGRST204', // column not in the schema cache
  'PGRST205', // table not in the schema cache
]);

export function isMissingSchemaError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && MISSING_SCHEMA_CODES.has(code);
}
