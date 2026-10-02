import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/fixture_runner.dart' as fixture;

const requestIds = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
];

void main() {
  const runId = '1-1-android';
  const sourceSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const journalSha256 =
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  test(
    'successful fixture exercises and reports the matching identity',
    () async {
      Map<String, dynamic>? reported;
      String? exercised;
      final result = await fixture.runFixture(
        requestIds: requestIds,
        phase: () async => 'read',
        report: (value) async => reported = Map.of(value),
        exercisePhase: (value) async => exercised = value,
        runId: runId,
        sourceSha: sourceSha,
        journalSha256: journalSha256,
      );
      expect(exercised, 'read');
      expect(result['passed'], true);
      expect(result['error'], null);
      expect(result['run_id'], runId);
      expect(result['source_sha'], sourceSha);
      expect(result['journal_sha256'], journalSha256);
      expect(result['request_ids'], [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ]);
      expect(reported, result);
    },
  );
  test('missing identity fails before exercising storage', () async {
    Map<String, dynamic>? reported;
    final result = await fixture.runFixture(
      requestIds: requestIds,
      phase: () async => 'read',
      report: (value) async => reported = Map.of(value),
      exercisePhase: (_) async => fail('Storage must not run'),
      runId: '',
      sourceSha: '',
      journalSha256: '',
    );
    expect(result['passed'], false);
    expect(result['error'], 'fixture_assertion_failed');
    expect(reported, result);
  });
  test(
    'phase channel failure writes fixed failure without invoking storage',
    () async {
      Map<String, dynamic>? reported;
      var exercised = false;
      final result = await fixture.runFixture(
        requestIds: requestIds,
        phase: () async => throw PlatformException(code: 'RAW_SECRET'),
        report: (value) async => reported = value,
        exercisePhase: (_) async => exercised = true,
      );
      expect(exercised, false);
      expect(reported?['passed'], false);
      expect(result['error'], 'phase_channel_failed');
      expect(result.toString(), isNot(contains('RAW_SECRET')));
    },
  );
  test('report channel failure remains failed and does not escape', () async {
    var exercised = false;
    final result = await fixture.runFixture(
      requestIds: requestIds,
      phase: () async => 'read',
      report: (_) async => throw PlatformException(code: 'RAW_SECRET'),
      exercisePhase: (_) async => exercised = true,
      runId: runId,
      sourceSha: sourceSha,
      journalSha256: journalSha256,
    );
    expect(exercised, true);
    expect(result['passed'], false);
    expect(result['error'], 'report_channel_failed');
    expect(result.toString(), isNot(contains('RAW_SECRET')));
  });
  test('absent phase emits failure and renders no storage pass', () async {
    final result = await fixture.runFixture(
      requestIds: requestIds,
      phase: () async => null,
      report: (_) async {},
      exercisePhase: (_) async => fail('Storage must not run'),
    );
    expect(result['passed'], false);
    expect(result['error'], 'phase_channel_failed');
  });
}
