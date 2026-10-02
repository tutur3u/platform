// A diagnostic marker can only fail a proof; it never satisfies the PASS gate.
export function isMatchingReportFailure(report, expected, phase, priorPids) {
  return (
    report?.passed === false &&
    report.error === 'report_failed' &&
    report.phase === phase &&
    report.run_id === expected.run_id &&
    report.source_sha === expected.source_sha &&
    report.journal_sha256 === expected.journal_sha256 &&
    Number.isSafeInteger(report.process_id) &&
    report.process_id > 0 &&
    !priorPids.includes(report.process_id)
  );
}
