const origins = new Set([
  'no_exception',
  'empty_structured_provenance',
  'catalog_check',
  'catalog_other_constraint',
  'unknown_structured_provenance',
]);
const categories = new Set([
  'other_redacted',
  'intent_staff_email_check',
  'intent_managed_name_check',
  'employee_staff_email_check',
  'employee_managed_name_check',
  'employee_lifecycle_check',
  'employee_recovery_check',
]);
const keys = [
  'ordinal',
  'sqlstate',
  'noException',
  'structuredOriginCategory',
  'constraintCategory',
  'catalogBound',
].sort();

export function parseProvenance(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 8192) {
    throw new Error('Bounded provenance required');
  }
  const lines = output.trimEnd().split(/\r?\n/u);
  if (
    lines.length !== 2 ||
    lines.some((line) => Buffer.byteLength(line) > 2048)
  ) {
    throw new Error('Two rows required');
  }
  return lines.map((line, index) => {
    // Fixed jsonb_build_object output only; duplicate/nested keys fail closed.
    const names = [...line.matchAll(/"([^"\\]*)"\s*:/gu)].map(
      (match) => match[1]
    );
    if (names.length !== 6 || new Set(names).size !== 6) {
      throw new Error('Exact unique keys required');
    }
    const row = JSON.parse(line);
    if (
      !row ||
      Array.isArray(row) ||
      JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(keys) ||
      row.ordinal !== index + 22 ||
      !Number.isInteger(row.ordinal) ||
      typeof row.noException !== 'boolean' ||
      typeof row.catalogBound !== 'boolean' ||
      !origins.has(row.structuredOriginCategory) ||
      !categories.has(row.constraintCategory)
    ) {
      throw new Error('Invalid provenance');
    }
    const bound = ['catalog_check', 'catalog_other_constraint'].includes(
      row.structuredOriginCategory
    );
    if (row.catalogBound !== bound) throw new Error('Catalog mismatch');
    if (row.noException) {
      if (
        row.sqlstate !== null ||
        row.structuredOriginCategory !== 'no_exception' ||
        bound ||
        row.constraintCategory !== 'other_redacted'
      ) {
        throw new Error('No-exception mismatch');
      }
    } else if (
      typeof row.sqlstate !== 'string' ||
      !/^[0-9A-Z]{5}$/u.test(row.sqlstate) ||
      row.structuredOriginCategory === 'no_exception'
    ) {
      throw new Error('SQLSTATE mismatch');
    }
    if (
      row.constraintCategory !== 'other_redacted' &&
      (!bound ||
        row.structuredOriginCategory !== 'catalog_check' ||
        row.sqlstate !== '23514')
    ) {
      throw new Error('Known CHECK mismatch');
    }
    return row;
  });
}
