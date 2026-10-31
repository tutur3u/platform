import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import 'mastermind_snapshot_builder.dart';
import 'mastermind_view_harness.dart';

String _id(int n) => 'item-${n.toRadixString(16).padLeft(20, '0')}';

/// A synthetic export with a mix of kinds, lane states, a failing environment
/// and one security row per section, so Home has something in every card.
Map<String, dynamic> homeJson({bool security = true, bool needsYou = true}) {
  final root = (MastermindSnapshotBuilder.defaults()..securityVariants = true)
      .toJson();
  final now = root['now'] as Map<String, dynamic>;
  final template =
      (now['needs_you'] as List<dynamic>).first as Map<String, dynamic>;
  Map<String, dynamic> need(int n, String kind, String title) => {
    ...template,
    'id': _id(n),
    'title': title,
    'kind': kind,
  };
  final securityRow = <String, dynamic>{
    'title': 'Security issue',
    'state': 'open',
    'product': 'Mastermind',
  };
  now['needs_you'] = [
    if (needsYou) ...[
      need(2, 'fyi', 'Fyi note'),
      need(3, 'action', 'Action item'),
      need(4, 'decision', 'First decision'),
      need(5, 'decision', 'Second decision'),
    ],
    if (security) securityRow,
  ];
  final lane = (root['lanes'] as List<dynamic>).first as Map<String, dynamic>;
  var laneId = 20;
  root['lanes'] = [
    for (final state in ['running', 'running', 'waiting', 'queued', 'failed'])
      {...lane, 'id': _id(laneId++), 'state': state},
    if (security) securityRow,
  ];
  root['backlog'] = [if (security) securityRow];
  final env =
      (root['environments'] as List<dynamic>).first as Map<String, dynamic>;
  root['environments'] = [
    env,
    {...env, 'environment': 'staging', 'deploy_status': 'failure'},
  ];
  final decision =
      (root['decisions'] as List<dynamic>).first as Map<String, dynamic>;
  root['decisions'] = [
    for (var i = 0; i < 4; i++)
      {
        ...decision,
        'id': 'd_00000000000$i',
        'title': 'Decision log $i',
        'at': '2026-01-31T1$i:00:00+00:00',
      },
  ];
  final events = <Map<String, dynamic>>[
    for (var seq = 2; seq <= 8; seq++)
      {
        'seq': seq,
        'ts': '2026-01-31T17:0$seq:00+00:00',
        'kind': 'lane',
        'payload': {...lane, 'id': _id(100 + seq), 'title': 'Lane event $seq'},
      },
  ];
  now
    ..['digest'] = events
    ..['latest_seq'] = events.last['seq'];
  return root;
}

MastermindSnapshot parsedSnapshot(Map<String, dynamic> json) {
  final outcome = parseMastermindSnapshot(snapshotBytes(json));
  if (outcome is! ParseAccepted) {
    throw StateError(
      'Fixture rejected: ${(outcome as ParseRejected).reason} '
      '${outcome.path}',
    );
  }
  return outcome.snapshot;
}
