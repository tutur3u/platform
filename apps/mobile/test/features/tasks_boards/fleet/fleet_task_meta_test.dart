import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';

const _block = '''
Some intro text.

<!-- fleet:v1 -->
status: waiting-review
owner: atlas
product: meet
priority: high
eta: 2026-11-18T12:00:00Z
last_update: 2026-11-18T09:30:00Z
needs_user: true
needs_user_reason: Approve the migration window
blocked_by: payments API key
links:
- pr: https://github.com/tutur3u/platform/pull/7245
- commit: 0123456789abcdef0123456789abcdef01234567
- thread: mastermind/atlas-4
<!-- /fleet:v1 -->

## Notes
status: done
''';

TaskBoardTask _task({
  String? description,
  List<String> labels = const [],
  String? priority,
  DateTime? endDate,
}) => TaskBoardTask(
  id: 'task-1',
  listId: 'list-1',
  description: description,
  priority: priority,
  endDate: endDate,
  labels: [
    for (var i = 0; i < labels.length; i++)
      TaskBoardTaskLabel(id: 'label-$i', name: labels[i]),
  ],
);

Map<String, dynamic> _paragraph(String text) => {
  'type': 'paragraph',
  'content': [
    {'type': 'text', 'text': text},
  ],
};

void main() {
  final now = DateTime.utc(2026, 11, 18, 10);

  group('parseFleetTaskMeta', () {
    test('reads every field of a full block and stops at the close', () {
      final meta = parseFleetTaskMeta(_task(description: _block));

      expect(meta.isFleetTask, isTrue);
      expect(meta.hasBlock, isTrue);
      expect(meta.status, FleetStatus.waitingReview);
      expect(meta.owner, 'atlas');
      expect(meta.product, 'meet');
      expect(meta.priority, 'high');
      expect(meta.eta, DateTime.utc(2026, 11, 18, 12));
      expect(meta.lastUpdate, DateTime.utc(2026, 11, 18, 9, 30));
      expect(meta.needsUser, isTrue);
      expect(meta.needsUserReason, 'Approve the migration window');
      expect(meta.blockedBy, 'payments API key');
      expect(meta.links.map((link) => link.kind), ['pr', 'commit', 'thread']);
      expect(meta.links.first.shortValue, '#7245');
      expect(meta.links[1].shortValue, '0123456');
      expect(meta.links[1].uri, isNull);
      expect(meta.links.first.uri, isNotNull);
    });

    test('accepts the state alias and markers without comments', () {
      final meta = parseFleetTaskMeta(
        _task(
          description: 'fleet:v1\nstate: running\nowner: iris\n\n## Next\nx',
        ),
      );

      expect(meta.hasBlock, isTrue);
      expect(meta.status, FleetStatus.running);
      expect(meta.owner, 'iris');
    });

    test('flattens a TipTap document into block lines', () {
      final doc = {
        'type': 'doc',
        'content': [
          _paragraph('<!-- fleet:v1 -->'),
          _paragraph('status: needs_user'),
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'owner: '},
              {'type': 'text', 'text': 'selene'},
            ],
          },
          _paragraph('links:'),
          {
            'type': 'bulletList',
            'content': [
              {
                'type': 'listItem',
                'content': [_paragraph('pr: https://example.com/pull/9')],
              },
            ],
          },
          _paragraph('<!-- /fleet:v1 -->'),
          _paragraph('owner: ignored'),
        ],
      };

      final meta = parseFleetTaskMeta(_task(description: jsonEncode(doc)));

      expect(meta.hasBlock, isTrue);
      expect(meta.status, FleetStatus.needsUser);
      expect(meta.needsUser, isTrue);
      expect(meta.owner, 'selene');
      expect(meta.links.single.shortValue, '#9');
    });

    test('falls back to labels, native priority and end date', () {
      final end = DateTime.utc(2026, 11, 20);
      final meta = parseFleetTaskMeta(
        _task(
          labels: [
            'needs-user',
            'state:waiting-review',
            'owner:rex',
            'product:web',
          ],
          priority: 'critical',
          endDate: end,
        ),
      );

      expect(meta.isFleetTask, isTrue);
      expect(meta.hasBlock, isFalse);
      expect(meta.status, FleetStatus.waitingReview);
      expect(meta.needsUser, isTrue);
      expect(meta.owner, 'rex');
      expect(meta.product, 'web');
      expect(meta.priority, 'critical');
      expect(meta.eta, end);
      expect(meta.lastUpdate, isNull);
    });

    test('a task without block or fleet labels is not a fleet task', () {
      final meta = parseFleetTaskMeta(
        _task(description: 'Plain notes', labels: ['bug']),
      );

      expect(meta.isFleetTask, isFalse);
      expect(fleetMetaOrNull(_task(labels: ['bug'])), isNull);
    });

    test('missing and unknown values stay null and are never faked', () {
      final meta = parseFleetTaskMeta(
        _task(description: '<!-- fleet:v1 -->\nstatus: sleeping\nowner:\n'),
      );

      expect(meta.isFleetTask, isTrue);
      expect(meta.status, isNull);
      expect(meta.displayStatus, isNull);
      expect(meta.owner, isNull);
      expect(meta.eta, isNull);
      expect(meta.lastUpdate, isNull);
      expect(meta.needsUser, isFalse);
      expect(meta.links, isEmpty);
      expect(meta.staleness(now: now), FleetStaleness.unknown);
      expect(meta.etaState(now: now), FleetEtaState.unknown);
    });
  });

  group('staleness', () {
    test('is fresh under two hours, aging under a day, stale after', () {
      FleetStaleness at(Duration age) =>
          fleetStaleness(now.subtract(age), now: now);

      expect(at(const Duration(minutes: 119)), FleetStaleness.fresh);
      expect(at(const Duration(hours: 2)), FleetStaleness.aging);
      expect(at(const Duration(hours: 23, minutes: 59)), FleetStaleness.aging);
      expect(at(const Duration(hours: 24)), FleetStaleness.stale);
      expect(fleetStaleness(null, now: now), FleetStaleness.unknown);
    });
  });

  group('eta state', () {
    FleetEtaState at(Duration offset, {bool isDone = false}) =>
        fleetEtaState(now.add(offset), isDone: isDone, now: now);

    test('is overdue once past unless the card is done', () {
      expect(at(const Duration(minutes: -1)), FleetEtaState.overdue);
      expect(
        at(const Duration(hours: -3), isDone: true),
        FleetEtaState.onTrack,
      );
    });

    test('is due soon within two hours, else on track', () {
      expect(at(const Duration(hours: 2)), FleetEtaState.dueSoon);
      expect(at(const Duration(hours: 2, minutes: 1)), FleetEtaState.onTrack);
    });

    test('a meta reports overdue from its own eta and status', () {
      final overdue = parseFleetTaskMeta(
        _task(
          description: 'fleet:v1\nstatus: running\neta: 2026-11-18T08:00:00Z',
        ),
      );
      final done = parseFleetTaskMeta(
        _task(description: 'fleet:v1\nstatus: done\neta: 2026-11-18T08:00:00Z'),
      );

      expect(overdue.etaState(now: now), FleetEtaState.overdue);
      expect(done.etaState(now: now), FleetEtaState.onTrack);
    });
  });

  test('only http(s) URLs written in the data become links', () {
    final meta = parseFleetTaskMeta(
      _task(
        description: [
          '<!-- fleet:v1 -->',
          'links: https://example.com/runs/1',
          '- doc: javascript:alert(1)',
          '- run: data:text/html,hi',
          '- pr: #7288',
          '- https://example.com/bare',
          '- issue: http://example.com/a b',
          '<!-- /fleet:v1 -->',
        ].join('\n'),
      ),
    );

    expect(meta.links.map((l) => l.kind).toList(), [
      'link',
      'doc',
      'run',
      'pr',
      'link',
      'issue',
    ]);
    expect(meta.links.map((l) => l.uri?.toString()).toList(), [
      'https://example.com/runs/1',
      null,
      null,
      null,
      'https://example.com/bare',
      null,
    ]);
  });
}
