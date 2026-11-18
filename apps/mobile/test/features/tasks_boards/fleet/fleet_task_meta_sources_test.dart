import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_external_link.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';

const _header = '''
<!-- fleet:v1 -->
status: blocked
owner: header-owner
product: header-product
priority: low
eta: 2026-11-30T00:00:00Z
last_update: 2026-11-18T09:30:00Z
needs_user: true
needs_user_reason: header reason
blocked_by: header blocker
links:
- pr: https://example.com/pull/1
<!-- /fleet:v1 -->''';

TaskBoardTask _task({
  String? description,
  List<String> labels = const [],
  String? priority,
  DateTime? endDate,
  List<TaskBoardTaskAssignee> assignees = const [],
  List<TaskBoardTaskProject> projects = const [],
  int blockedByCount = 0,
  bool? needsUser,
  String? needsUserReason,
  String? blockedReason,
  List<TaskExternalLink> externalLinks = const [],
}) => TaskBoardTask(
  id: 'task-1',
  listId: 'list-1',
  description: description,
  priority: priority,
  endDate: endDate,
  assignees: assignees,
  projects: projects,
  relationshipSummary: TaskRelationshipSummary(blockedByCount: blockedByCount),
  needsUser: needsUser,
  needsUserReason: needsUserReason,
  blockedReason: blockedReason,
  externalLinks: externalLinks,
  labels: [
    for (var i = 0; i < labels.length; i++)
      TaskBoardTaskLabel(id: 'label-$i', name: labels[i]),
  ],
);

void main() {
  group('first-class fields without a description header', () {
    test('labels and native fields resolve everything', () {
      final meta = parseFleetTaskMeta(
        _task(
          labels: ['needs-user', 'owner:rex', 'product:web'],
          priority: 'high',
          endDate: DateTime.utc(2026, 11, 20),
          blockedByCount: 2,
          needsUserReason: 'Pick a date',
          blockedReason: 'Waiting on legal',
          externalLinks: const [
            TaskExternalLink(
              kind: 'pr',
              url: 'https://example.com/pull/7',
              label: 'Fix #7',
            ),
          ],
        ),
        listStatus: 'review',
      );

      expect(meta.isFleetTask, isTrue);
      expect(meta.hasBlock, isFalse);
      expect(meta.status, FleetStatus.waitingReview);
      expect(meta.owner, 'rex');
      expect(meta.product, 'web');
      expect(meta.priority, 'high');
      expect(meta.eta, DateTime.utc(2026, 11, 20));
      expect(meta.needsUser, isTrue);
      expect(meta.needsUserReason, 'Pick a date');
      expect(meta.isBlocked, isTrue);
      expect(meta.blockedBy, 'Waiting on legal');
      expect(meta.blockedByCount, 2);
      expect(meta.links.single.shortValue, 'Fix #7');
      expect(meta.links.single.uri, isNotNull);
      expect(meta.lastUpdate, isNull);
    });

    test('the assignee and first project supply owner and product', () {
      final meta = parseFleetTaskMeta(
        _task(
          labels: ['state:running'],
          assignees: const [
            TaskBoardTaskAssignee(id: 'u1', displayName: ' '),
            TaskBoardTaskAssignee(id: 'u2', displayName: 'Second'),
          ],
        ),
      );
      final byEmail = parseFleetTaskMeta(
        _task(
          labels: ['state:running'],
          assignees: const [
            TaskBoardTaskAssignee(id: 'u1', email: 'lan@example.com'),
          ],
          projects: const [
            TaskBoardTaskProject(id: 'p1', name: 'Meet'),
            TaskBoardTaskProject(id: 'p2', name: 'Other'),
          ],
        ),
      );

      // Only the first assignee is considered, and ids never read as names.
      expect(meta.owner, isNull);
      expect(byEmail.owner, 'lan@example.com');
      expect(byEmail.product, 'Meet');
    });

    test('a blocked-by relationship alone marks the task blocked', () {
      final meta = parseFleetTaskMeta(
        _task(labels: ['state:running'], blockedByCount: 1),
      );

      expect(meta.isBlocked, isTrue);
      expect(meta.blockedBy, isNull);
    });

    test('a native needs_user value or external link marks a fleet task', () {
      expect(parseFleetTaskMeta(_task(needsUser: false)).isFleetTask, isTrue);
      expect(
        parseFleetTaskMeta(
          _task(
            externalLinks: const [
              TaskExternalLink(kind: 'pr', url: 'https://example.com/a'),
            ],
          ),
        ).isFleetTask,
        isTrue,
      );
      expect(parseFleetTaskMeta(_task()).isFleetTask, isFalse);
    });
  });

  group('status resolution', () {
    test('a state label beats the list status, which beats the header', () {
      final withLabel = parseFleetTaskMeta(
        _task(description: _header, labels: ['state:waiting-ci']),
        listStatus: 'active',
      );
      final withList = parseFleetTaskMeta(
        _task(description: _header),
        listStatus: 'active',
      );

      expect(withLabel.status, FleetStatus.waitingCi);
      expect(withList.status, FleetStatus.running);
    });

    test('list statuses map to fleet statuses', () {
      FleetStatus? at(String? status) => parseFleetTaskMeta(
        _task(labels: ['owner:x']),
        listStatus: status,
      ).status;

      expect(at('not_started'), FleetStatus.queued);
      expect(at('active'), FleetStatus.running);
      expect(at('review'), FleetStatus.waitingReview);
      expect(at('done'), FleetStatus.done);
      expect(at('closed'), FleetStatus.done);
      expect(at('documents'), isNull);
      expect(at(null), isNull);
    });

    test('the header status applies when the list status is unknown', () {
      final meta = parseFleetTaskMeta(
        _task(description: _header),
        listStatus: 'documents',
      );

      expect(meta.status, FleetStatus.blocked);
    });
  });

  group('the header is only a fallback', () {
    test('it fills every value the task does not carry', () {
      final meta = parseFleetTaskMeta(_task(description: _header));

      expect(meta.status, FleetStatus.blocked);
      expect(meta.owner, 'header-owner');
      expect(meta.product, 'header-product');
      expect(meta.priority, 'low');
      expect(meta.eta, DateTime.utc(2026, 11, 30));
      expect(meta.lastUpdate, DateTime.utc(2026, 11, 18, 9, 30));
      expect(meta.needsUser, isTrue);
      expect(meta.needsUserReason, 'header reason');
      expect(meta.blockedBy, 'header blocker');
      expect(meta.links.single.shortValue, '#1');
    });

    test('a header status of needs_user still raises the flag', () {
      final meta = parseFleetTaskMeta(
        _task(description: '<!-- fleet:v1 -->\nstatus: needs_user'),
        listStatus: 'active',
      );

      expect(meta.status, FleetStatus.running);
      expect(meta.needsUser, isTrue);
    });

    test('native false wins over both the label and legacy status', () {
      final meta = parseFleetTaskMeta(
        _task(
          description: '<!-- fleet:v1 -->\nstatus: needs_user',
          labels: ['needs-user'],
          needsUser: false,
        ),
        listStatus: 'active',
      );

      expect(meta.status, FleetStatus.running);
      expect(meta.needsUser, isFalse);
    });

    test('a first-class field beats a conflicting header value', () {
      final meta = parseFleetTaskMeta(
        _task(
          description: _header,
          labels: ['owner:label-owner', 'product:label-product'],
          priority: 'critical',
          endDate: DateTime.utc(2026, 12),
          assignees: const [
            TaskBoardTaskAssignee(id: 'u1', displayName: 'Assignee'),
          ],
          projects: const [TaskBoardTaskProject(id: 'p1', name: 'Project')],
          needsUser: false,
          needsUserReason: 'native reason',
          blockedReason: 'native blocker',
          externalLinks: const [
            TaskExternalLink(kind: 'thread', url: 'https://example.com/t/2'),
          ],
        ),
        listStatus: 'done',
      );

      expect(meta.status, FleetStatus.done);
      expect(meta.owner, 'label-owner');
      expect(meta.product, 'Project');
      expect(meta.priority, 'critical');
      expect(meta.eta, DateTime.utc(2026, 12));
      expect(meta.needsUser, isFalse);
      expect(meta.needsUserReason, 'native reason');
      expect(meta.blockedBy, 'native blocker');
      expect(meta.links.map((link) => link.kind), ['thread']);
    });

    test('the assignee beats the header owner', () {
      final meta = parseFleetTaskMeta(
        _task(
          description: _header,
          assignees: const [
            TaskBoardTaskAssignee(id: 'u1', displayName: 'Assignee'),
          ],
        ),
      );

      expect(meta.owner, 'Assignee');
    });
  });

  group('TaskBoardTask json', () {
    test('reads and round-trips the native fleet fields', () {
      final task = TaskBoardTask.fromJson(const {
        'id': 'task-1',
        'list_id': 'list-1',
        'needs_user': true,
        'needs_user_reason': ' Approve ',
        'blocked_reason': 'Legal',
        'external_links': [
          {'kind': 'PR', 'url': 'https://example.com/pull/3', 'label': 'PR 3'},
          {'kind': 'doc'},
          {'url': 42},
          'junk',
        ],
      });

      expect(task.needsUser, isTrue);
      expect(task.needsUserReason, 'Approve');
      expect(task.blockedReason, 'Legal');
      expect(task.externalLinks.single.kind, 'pr');
      expect(TaskBoardTask.fromJson(task.toJson()), task);
      expect(task.copyWith(name: 'x').externalLinks, task.externalLinks);
    });

    test('absent fields stay null and are not written back', () {
      final task = TaskBoardTask.fromJson(const {'id': 'a', 'list_id': 'b'});

      expect(task.needsUser, isNull);
      expect(task.externalLinks, isEmpty);
      expect(task.toJson().containsKey('needs_user'), isFalse);
      expect(task.toJson().containsKey('external_links'), isFalse);
    });
  });
}
