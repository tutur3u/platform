/**
 * @typedef {{case:'inactive-actor',check:'ban-update'|'request',status:null,code:null,noStore:null}
 * | {case:'inactive-actor',check:'json',status:number,code:null,noStore:null}
 * | {case:'inactive-actor',check:'no-store'|'status-code',status:number,code:'absent'|'forbidden'|'unauthorized'|'other',noStore:boolean}} CaseDiagnostic
 */
const checks = ['ban-update', 'request', 'json', 'no-store', 'status-code'];
const codes = ['absent', 'forbidden', 'unauthorized', 'other'];

/** @returns {CaseDiagnostic} */
export function projectCaseDiagnostic(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.case !== 'inactive-actor' ||
    !checks.includes(value.check)
  )
    throw new Error('Web case diagnostic invalid');
  const beforeResponse = ['ban-update', 'request'].includes(value.check);
  const beforeBody = beforeResponse || value.check === 'json';
  if (
    (beforeResponse
      ? value.status !== null
      : !Number.isInteger(value.status) ||
        value.status < 100 ||
        value.status > 599) ||
    (value.check === 'status-code' && value.noStore !== true) ||
    (beforeBody
      ? value.code !== null || value.noStore !== null
      : !codes.includes(value.code) || typeof value.noStore !== 'boolean')
  )
    throw new Error('Web case diagnostic invalid');
  return {
    case: 'inactive-actor',
    check: value.check,
    status: value.status,
    code: value.code,
    noStore: value.noStore,
  };
}

export function caseResponseDiagnostic(status, code, noStore) {
  return projectCaseDiagnostic({
    case: 'inactive-actor',
    check: 'no-store',
    status,
    noStore,
    code:
      code === undefined
        ? 'absent'
        : ['forbidden', 'unauthorized'].includes(code)
          ? code
          : 'other',
  });
}
