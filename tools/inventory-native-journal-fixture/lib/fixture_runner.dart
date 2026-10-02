const _run = String.fromEnvironment('FIXTURE_RUN');
const _sha = String.fromEnvironment('SOURCE_SHA');
const _sourceDigest = String.fromEnvironment('JOURNAL_SHA256');

Future<Map<String, dynamic>> runFixture({
  required Future<String?> Function() phase,
  required Future<void> Function(Map<String, dynamic>) report,
  required Future<void> Function(String?) exercisePhase,
  String runId = _run,
  String sourceSha = _sha,
  String journalSha256 = _sourceDigest,
  required List<String> requestIds,
}) async {
  String? selected;
  var passed = false;
  String? error;
  try {
    selected = await phase();
    require(selected != null, 'Missing fixture phase');
  } on Object {
    error = 'phase_channel_failed';
  }
  if (error == null) {
    try {
      require(
        runId.isNotEmpty &&
            RegExp(r'^[0-9a-f]{40}$').hasMatch(sourceSha) &&
            RegExp(r'^[0-9a-f]{64}$').hasMatch(journalSha256),
        'Missing fixture identity',
      );
      await exercisePhase(selected);
      passed = true;
    } on Object {
      error = 'fixture_assertion_failed';
    }
  }
  final result = <String, dynamic>{
    'phase': selected,
    'passed': passed,
    'error': error,
    'run_id': runId,
    'source_sha': sourceSha,
    'journal_sha256': journalSha256,
    'request_ids': requestIds,
  };
  try {
    await report(result);
  } on Object {
    result['passed'] = false;
    result['error'] = 'report_channel_failed';
  }
  return result;
}

void require(bool condition, String message) {
  if (!condition) throw StateError(message);
}
