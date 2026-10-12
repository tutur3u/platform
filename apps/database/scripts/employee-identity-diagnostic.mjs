const states = new Set([
  '23514',
  '42501',
  '42P01',
  '42703',
  '42883',
  '3F000',
  '23505',
  '23503',
  '55000',
  '40P01',
  '57014',
  'other_redacted',
]);
const routines = new Set([
  'none',
  'other_redacted',
  'audit_identity_contract',
  'create_user_profile',
  'bind_employee_creation_intent',
  'check_employee_creation_commit',
  'enforce_employee_full_name',
  'auto_create_personal_workspace',
  'add_ws_creator',
  'enforce_personal_workspace_single_member',
]);
const categories = ['negative', 'positive', 'ordinary'];
const boolKeys = [
  'noException',
  'caseRolledBack',
  'intentBeforeimageRetained',
  'reservationBeforeimageRetained',
  'catalogPresent',
  'sessionIsSupabaseAdmin',
  'auditOwnerIsSessionUser',
  'profileOwnerIsSessionUser',
  'profileOwnerCanUseTempSchema',
  'profileOwnerCanInsertAudit',
  'deferredOwnerCanUseTempSchema',
  'deferredOwnerCanInsertAudit',
];
const keys = [
  'ordinal',
  'caseCategory',
  'phase',
  'sqlstate',
  'routineCategory',
  'catalogHash',
  ...boolKeys,
].sort();

export function parseIdentityDiagnostic(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 8192)
    throw new Error('Bounded identity diagnostic required');
  const lines = output.trimEnd().split(/\r?\n/u);
  if (
    lines.length !== 3 ||
    lines.some((line) => Buffer.byteLength(line) > 2048)
  )
    throw new Error('Exactly three diagnostic rows required');
  const rows = lines.map((line, index) => {
    const names = [...line.matchAll(/"([^"\\]*)"\s*:/gu)].map(
      (match) => match[1]
    );
    if (names.length !== keys.length || new Set(names).size !== keys.length)
      throw new Error('Exact unique diagnostic keys required');
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error('Invalid diagnostic JSON');
    }
    if (
      !row ||
      Array.isArray(row) ||
      JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(keys) ||
      row.ordinal !== index + 1 ||
      row.caseCategory !== categories[index] ||
      !Number.isInteger(row.phase) ||
      row.phase < 1 ||
      row.phase > 4 ||
      !routines.has(row.routineCategory) ||
      !/^[a-f0-9]{32}$/u.test(row.catalogHash ?? '') ||
      boolKeys.some((key) => typeof row[key] !== 'boolean') ||
      !row.sessionIsSupabaseAdmin
    )
      throw new Error('Invalid identity diagnostic record');
    if (row.noException) {
      if (
        row.phase !== 4 ||
        row.sqlstate !== null ||
        row.routineCategory !== 'none'
      )
        throw new Error('Invalid completed rollback control');
    } else if (
      row.phase === 4 ||
      !states.has(row.sqlstate) ||
      row.routineCategory === 'none'
    )
      throw new Error('Invalid caught-error control');
    return row;
  });
  if (rows.some((row) => row.catalogHash !== rows[0].catalogHash))
    throw new Error('Catalog changed between diagnostic cases');
  return rows;
}
