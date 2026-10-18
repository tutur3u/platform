/**
 * @typedef {{case:'inactive-actor'|'self-action',check:'ban-update'|'request',status:null,code:null,noStore:null}
 * | {case:'inactive-actor'|'self-action',check:'json',status:number,code:null,noStore:null}
 * | {case:'inactive-actor'|'self-action',check:'no-store'|'status-code',status:number,code:'absent'|'forbidden'|'unauthorized'|'other'|'employee_self_action'|'invalid_request'|'UNAUTHENTICATED',noStore:boolean}} CaseDiagnostic
 */
const checks = ['ban-update', 'request', 'json', 'no-store', 'status-code'];
const codes = ['absent', 'forbidden', 'unauthorized', 'other'];
const responseCodes = ['forbidden', 'unauthorized'];
const selfResponseCodes = [
  ...responseCodes,
  'employee_self_action',
  'invalid_request',
  'UNAUTHENTICATED',
];
const selfCodes = ['absent', 'other', ...selfResponseCodes];

/** @returns {CaseDiagnostic} */
export function projectCaseDiagnostic(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !['inactive-actor', 'self-action'].includes(value.case) ||
    (value.case === 'self-action' && value.check === 'ban-update') ||
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
      : !(value.case === 'self-action' ? selfCodes : codes).includes(
          value.code
        ) || typeof value.noStore !== 'boolean')
  )
    throw new Error('Web case diagnostic invalid');
  return {
    case: value.case,
    check: value.check,
    status: value.status,
    code: value.code,
    noStore: value.noStore,
  };
}

export function caseResponseDiagnostic(
  status,
  code,
  noStore,
  caseName = 'inactive-actor'
) {
  return projectCaseDiagnostic({
    case: caseName,
    check: 'no-store',
    status,
    noStore,
    code:
      code === undefined
        ? 'absent'
        : (caseName === 'self-action'
              ? selfResponseCodes
              : responseCodes
            ).includes(code)
          ? code
          : 'other',
  });
}
