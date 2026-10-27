import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

Uint8List encode(Object? value) =>
    Uint8List.fromList(utf8.encode(jsonEncode(value)));
Map<String, dynamic> map(Object? value) => value! as Map<String, dynamic>;
List<dynamic> list(Object? value) => value! as List<dynamic>;
Map<String, dynamic> observability(Map<String, dynamic> root, String section) =>
    map(map(root['observability'])[section]);
Map<String, dynamic> usageRow(Map<String, dynamic> root) =>
    map(list(observability(root, 'usage')['series'])[3]);
Map<String, dynamic> modelRow(Map<String, dynamic> root) =>
    map(list(observability(root, 'models')['breakdown']).first);

void main() {
  test('default builder and committed asset are identical and accepted', () {
    final builder = MastermindSnapshotBuilder.defaults();
    final asset = File(
      'assets/dev/mastermind/sample_snapshot.json',
    ).readAsBytesSync();
    expect(jsonDecode(utf8.decode(asset)), builder.toJson());
    expect(parseMastermindSnapshot(asset), isA<ParseAccepted>());
    expect(parseMastermindSnapshot(builder.bytes()), isA<ParseAccepted>());
  });

  final mutations = <String, void Function(Map<String, dynamic>)>{
    'unknown root key': (r) => r['unexpected'] = true,
    'unknown usage point key': (r) => usageRow(r)['unexpected'] = true,
    'unknown lane key': (r) => map(list(r['lanes']).first)['unexpected'] = true,
    'missing required key': (r) => r.remove('sources'),
    'unknown product': (r) => map(list(r['backlog']).first)['product'] = 'new',
    'unknown pacing': (r) => map(usageRow(r)['session'])['pacing'] = 'NEW',
    'timestamp Z': (r) => r['generated_at'] = '2026-01-31T17:30:00Z',
    'impossible calendar day': (r) =>
        r['generated_at'] = '2026-02-30T17:30:00+00:00',
    'timestamp trailing newline': (r) =>
        r['generated_at'] = '2026-01-31T17:30:00+00:00\n',
    'remaining above 100': (r) =>
        map(usageRow(r)['session'])['remaining_percent'] = 101,
    'rate above one': (r) => modelRow(r)['success_rate'] = 1.2,
    'negative duration': (r) => modelRow(r)['median_duration_seconds'] = -1,
    'noninteger count': (r) => modelRow(r)['runs'] = 1.5,
    'null required number': (r) => modelRow(r)['runs'] = null,
    'wrong boolean': (r) => modelRow(r)['tentative'] = 1,
    'array overflow': (r) =>
        r['decisions'] = List.filled(1001, list(r['decisions']).first),
    'duplicate options': (r) =>
        map(list(map(r['now'])['needs_you']).first)['options'] = [
          'same',
          'same',
        ],
    'long title': (r) => map(list(r['lanes']).first)['title'] = 'x' * 101,
    'bad item id': (r) => map(list(r['lanes']).first)['id'] = 'item-xyz',
    'bad hash': (r) =>
        map(list(map(r['now'])['needs_you']).first)['version_hash'] = 'x' * 64,
    'bad sha': (r) => map(list(r['environments']).first)['sha'] = 'not-hex',
    'bad actor': (r) => map(list(r['decisions']).first)['by'] = 'someone',
    'account handle': (r) => usageRow(r)['instance'] = 'claude_fixture',
    'account punctuation': (r) => usageRow(r)['instance'] = 'fixture-account',
    'account empty': (r) => usageRow(r)['instance'] = '',
    'security extra body': (r) => r['lanes'] = [
      {'title': 'Security issue', 'state': 'open', 'body': 'not allowed'},
    ],
    'security wrong title': (r) => r['lanes'] = [
      {'title': 'Private issue', 'state': 'open'},
    ],
    'needs you not open': (r) =>
        map(list(map(r['now'])['needs_you']).first)['state'] = 'answered',
    'event payload wrong kind': (r) =>
        map(list(map(r['now'])['digest']).first)['kind'] = 'environment',
  };
  for (final entry in mutations.entries) {
    test('rejects ${entry.key}', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      entry.value(root);
      final result = parseMastermindSnapshot(encode(root));
      expect(result, isA<ParseRejected>());
      expect((result as ParseRejected).reason, RejectionReason.schemaViolation);
    });
  }

  test('unsupported schema version is a distinct category', () {
    final root = MastermindSnapshotBuilder.defaults().toJson()
      ..['schema_version'] = '1.3';
    expect(
      (parseMastermindSnapshot(encode(root)) as ParseRejected).reason,
      RejectionReason.unsupportedVersion,
    );
  });
  test('byte cap enforced before decoding', () {
    expect(
      (parseMastermindSnapshot(Uint8List(600001)) as ParseRejected).reason,
      RejectionReason.tooLarge,
    );
    final b = MastermindSnapshotBuilder.defaults()..nearCap = true;
    expect(b.bytes().length, 599999);
    expect(parseMastermindSnapshot(b.bytes()), isA<ParseAccepted>());
  });
  for (final bytes in [
    utf8.encode('{'),
    [255],
    utf8.encode('null'),
    utf8.encode('[]'),
  ]) {
    test(
      'invalid input: ${bytes.length} bytes starting with ${bytes.first}',
      () {
        final result = parseMastermindSnapshot(Uint8List.fromList(bytes));
        expect(result, isA<ParseRejected>());
        expect(
          (result as ParseRejected).reason,
          bytes.first == 255 || bytes.first == 123
              ? RejectionReason.malformedJson
              : RejectionReason.schemaViolation,
        );
      },
    );
  }
  test('null observations remain null and models are immutable', () {
    final b = MastermindSnapshotBuilder.defaults()..nullRuns = true;
    final snapshot =
        (parseMastermindSnapshot(b.bytes()) as ParseAccepted).snapshot;
    final window = snapshot.observability.usage.series[1].session;
    expect(window.remainingPercent, isNull);
    expect(window.pacing, isNull);
    expect(window.projectedRemainingAtReset, isNull);
    expect(snapshot.lanes.clear, throwsUnsupportedError);
    expect(snapshot.observability.usage.series.clear, throwsUnsupportedError);
  });
  test('security variants remain typed and redacted', () {
    final b = MastermindSnapshotBuilder.defaults()..securityVariants = true;
    final snapshot =
        (parseMastermindSnapshot(b.bytes()) as ParseAccepted).snapshot;
    expect(snapshot.lanes.last, isA<SecurityItem>());
    expect(snapshot.now.needsYou.last, isA<SecurityItem>());
    expect(snapshot.backlog.last, isA<SecurityItem>());
    expect(snapshot.decisions.every((d) => d is JournalDecision), isTrue);
  });
  test('builder coverage gaps downsampling stale cursor and empty stream', () {
    final b = MastermindSnapshotBuilder.defaults()
      ..coverage['fleet'] = 'missing'
      ..gaps = true
      ..downsampled = true
      ..partialLastBucket = true
      ..stale = true
      ..cursorGap = true
      ..emptyCoordination = true;
    final snapshot =
        (parseMastermindSnapshot(b.bytes()) as ParseAccepted).snapshot;
    expect(snapshot.observability.fleet.coverage, Coverage.missing);
    expect(snapshot.observability.usage.coverage, Coverage.partial);
    expect(snapshot.now.cursorGap, isTrue);
    expect(snapshot.generatedAt.year, 2025);
    expect(snapshot.observability.coordination.messages, isEmpty);
    final points = snapshot.observability.usage.series;
    expect(points[2].t.difference(points[1].t), const Duration(minutes: 105));
  });
  test('deterministic malformed byte fuzz never escapes the parser', () {
    final random = Random(23);
    for (var i = 0; i < 300; i++) {
      final bytes = Uint8List.fromList(
        List.generate(random.nextInt(200), (_) => random.nextInt(256)),
      );
      expect(parseMastermindSnapshot(bytes), isA<ParseRejected>());
    }
  });
}
