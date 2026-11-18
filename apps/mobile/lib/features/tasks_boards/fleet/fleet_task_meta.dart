import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_block_reader.dart';

/// The lifecycle states a fleet card can report.
enum FleetStatus {
  running('running'),
  needsUser('needs_user'),
  waitingReview('waiting_review'),
  waitingCi('waiting_ci'),
  blocked('blocked'),
  queued('queued'),
  done('done');

  const FleetStatus(this.key);

  final String key;

  /// The status for a stored value such as `waiting-review`, or null when
  /// the value is empty or unknown.
  static FleetStatus? tryParse(String? raw) {
    final normalized = normalizeFleetKey(raw);
    for (final status in values) {
      if (status.key == normalized) return status;
    }
    return null;
  }
}

/// How recently a card reported progress.
enum FleetStaleness { fresh, aging, stale, unknown }

/// Where the ETA sits relative to now.
enum FleetEtaState { overdue, dueSoon, onTrack, unknown }

/// One entry of the `links:` list.
class FleetTaskLink extends Equatable {
  const FleetTaskLink({required this.kind, required this.value, this.label});

  /// `pr`, `commit`, `thread` or another lowercase kind.
  final String kind;
  final String value;

  /// A display name sent with the link, shown in place of [shortValue].
  final String? label;

  /// The web URL of the link, or null when [value] is a bare reference such
  /// as a commit SHA.
  Uri? get uri {
    if (RegExp(r'\s').hasMatch(value)) return null;
    final parsed = Uri.tryParse(value);
    if (parsed == null) return null;
    final scheme = parsed.scheme.toLowerCase();
    if ((scheme == 'https' || scheme == 'http') && parsed.host.isNotEmpty) {
      return parsed;
    }
    return null;
  }

  /// A short label for the value: `#7245` for a pull request URL, seven
  /// characters of a commit SHA, otherwise the value itself.
  String get shortValue {
    if (label != null) return label!;
    if (kind == 'pr') {
      final match = RegExp(r'/pull/(\d+)').firstMatch(value);
      if (match != null) return '#${match.group(1)}';
    }
    if (kind == 'commit' && RegExp(r'^[0-9a-fA-F]{8,40}$').hasMatch(value)) {
      return value.substring(0, 7);
    }
    return value;
  }

  @override
  List<Object?> get props => [kind, value, label];
}

/// The fleet:v1 metadata of a task. Missing or unknown values stay null.
class FleetTaskMeta extends Equatable {
  const FleetTaskMeta({
    this.isFleetTask = false,
    this.hasBlock = false,
    this.status,
    this.owner,
    this.product,
    this.priority,
    this.eta,
    this.lastUpdate,
    this.needsUser = false,
    this.needsUserReason,
    this.blockedBy,
    this.blockedByCount = 0,
    this.links = const [],
  });

  /// A fleet label, the header block or a native fleet field is present.
  final bool isFleetTask;

  /// A `fleet:v1` block was found in the description.
  final bool hasBlock;
  final FleetStatus? status;
  final String? owner;
  final String? product;
  final String? priority;
  final DateTime? eta;
  final DateTime? lastUpdate;
  final bool needsUser;
  final String? needsUserReason;
  final String? blockedBy;

  /// Open blocked-by relationships of the task.
  final int blockedByCount;
  final List<FleetTaskLink> links;

  /// The task has a blocked-by reason or an open blocked-by relationship.
  bool get isBlocked => blockedBy != null || blockedByCount > 0;

  /// The status to show: the reported one, else needs-you when flagged.
  FleetStatus? get displayStatus =>
      status ?? (needsUser ? FleetStatus.needsUser : null);

  /// Age bucket of [lastUpdate] at [now].
  FleetStaleness staleness({DateTime? now}) =>
      fleetStaleness(lastUpdate, now: now ?? DateTime.now());

  /// ETA bucket at [now]; a finished card is never overdue.
  FleetEtaState etaState({DateTime? now}) => fleetEtaState(
    eta,
    isDone: displayStatus == FleetStatus.done,
    now: now ?? DateTime.now(),
  );

  @override
  List<Object?> get props => [
    isFleetTask,
    hasBlock,
    status,
    owner,
    product,
    priority,
    eta,
    lastUpdate,
    needsUser,
    needsUserReason,
    blockedBy,
    blockedByCount,
    links,
  ];
}

const _freshWindow = Duration(hours: 2);
const _staleWindow = Duration(hours: 24);
const _dueSoonWindow = Duration(hours: 2);

/// Fresh under two hours, aging up to a day, stale from a day on.
FleetStaleness fleetStaleness(DateTime? lastUpdate, {required DateTime now}) {
  if (lastUpdate == null) return FleetStaleness.unknown;
  final age = now.difference(lastUpdate);
  if (age < _freshWindow) return FleetStaleness.fresh;
  if (age < _staleWindow) return FleetStaleness.aging;
  return FleetStaleness.stale;
}

/// Overdue once past and not done, due soon within two hours, else on track.
FleetEtaState fleetEtaState(
  DateTime? eta, {
  required bool isDone,
  required DateTime now,
}) {
  if (eta == null) return FleetEtaState.unknown;
  if (eta.isBefore(now)) {
    return isDone ? FleetEtaState.onTrack : FleetEtaState.overdue;
  }
  if (eta.difference(now) <= _dueSoonWindow) return FleetEtaState.dueSoon;
  return FleetEtaState.onTrack;
}

const _priorities = {'critical', 'high', 'normal', 'low'};

/// The fleet status a list status maps to; documents and unknown statuses
/// map to none.
FleetStatus? fleetStatusForListStatus(String? listStatus) =>
    switch (listStatus?.trim().toLowerCase()) {
      'not_started' => FleetStatus.queued,
      'active' => FleetStatus.running,
      'review' => FleetStatus.waitingReview,
      'done' || 'closed' => FleetStatus.done,
      _ => null,
    };

String? _firstText(Iterable<String?> candidates) {
  for (final candidate in candidates) {
    final text = candidate?.trim();
    if (text != null && text.isNotEmpty) return text;
  }
  return null;
}

/// Reads the fleet metadata of [task]. Each value resolves from the first
/// first-class source that has it, then from the temporary `fleet:v1`
/// description header:
///
/// - status: `state:` label, the status of the task's list ([listStatus]),
///   header;
/// - owner: `owner:` label, first assignee, header;
/// - product: first project, `product:` label, header;
/// - priority and ETA: the native priority and end date, header;
/// - last update: header only, because the task API does not send
///   `updated_at`;
/// - needs you and its reason: native fields, `needs-user` label, header;
/// - blocked: a blocked-by relationship, `blocked_reason`, header;
/// - links: native external links, header.
FleetTaskMeta parseFleetTaskMeta(TaskBoardTask task, {String? listStatus}) {
  final block = readFleetBlock(task.description);
  final hasBlock = block != null;
  final fields = block?.fields ?? const <String, String>{};

  String? labelValue(String prefix) {
    for (final label in task.labels) {
      final name = label.name?.trim() ?? '';
      if (name.toLowerCase().startsWith(prefix)) {
        final value = name.substring(prefix.length).trim();
        if (value.isNotEmpty) return value;
      }
    }
    return null;
  }

  bool hasLabel(String prefix) => task.labels.any(
    (label) => (label.name?.trim().toLowerCase() ?? '').startsWith(prefix),
  );

  final labelNeedsUser = task.labels.any(
    (label) => normalizeFleetKey(label.name) == 'needs_user',
  );
  final nativeLinks = [
    for (final link in task.externalLinks)
      FleetTaskLink(kind: link.kind, value: link.url, label: link.label),
  ];
  final hasFleetLabel =
      labelNeedsUser ||
      hasLabel('state:') ||
      hasLabel('owner:') ||
      hasLabel('product:');

  final headerStatus =
      FleetStatus.tryParse(fields['status']) ??
      FleetStatus.tryParse(fields['state']);
  final status =
      FleetStatus.tryParse(labelValue('state:')) ??
      fleetStatusForListStatus(listStatus) ??
      headerStatus;
  final needsUser =
      task.needsUser ??
      (labelNeedsUser ? true : null) ??
      _parseBool(fields['needs_user']) ??
      (status == FleetStatus.needsUser ||
          headerStatus == FleetStatus.needsUser);
  final nativePriority = normalizeFleetKey(task.priority);
  final headerPriority = normalizeFleetKey(fields['priority']);
  final priority = _priorities.contains(nativePriority)
      ? nativePriority
      : (_priorities.contains(headerPriority) ? headerPriority : null);

  return FleetTaskMeta(
    isFleetTask:
        hasBlock ||
        hasFleetLabel ||
        task.needsUser != null ||
        nativeLinks.isNotEmpty,
    hasBlock: hasBlock,
    status: status,
    owner: _firstText([
      labelValue('owner:'),
      for (final assignee in task.assignees.take(1)) ...[
        assignee.displayName,
        assignee.email,
      ],
      fields['owner'],
    ]),
    product: _firstText([
      for (final project in task.projects.take(1)) project.name,
      labelValue('product:'),
      fields['product'],
    ]),
    priority: priority,
    eta: task.endDate ?? _parseDate(fields['eta']),
    // TODO(tasks): Prefer updated_at when the task API exposes it.
    lastUpdate: _parseDate(fields['last_update']),
    needsUser: needsUser,
    needsUserReason: _firstText([
      task.needsUserReason,
      fields['needs_user_reason'],
    ]),
    blockedBy: _firstText([task.blockedReason, fields['blocked_by']]),
    blockedByCount: task.relationshipSummary.blockedByCount,
    links: nativeLinks.isNotEmpty
        ? nativeLinks
        : [
            for (final link
                in block?.links ?? const <({String kind, String value})>[])
              FleetTaskLink(kind: link.kind, value: link.value),
          ],
  );
}

bool? _parseBool(String? raw) {
  switch (raw?.trim().toLowerCase()) {
    case 'true' || 'yes' || '1':
      return true;
    case 'false' || 'no' || '0':
      return false;
  }
  return null;
}

DateTime? _parseDate(String? raw) =>
    raw == null ? null : DateTime.tryParse(raw);

/// The metadata of [task] when it is a fleet card, else null.
FleetTaskMeta? fleetMetaOrNull(TaskBoardTask task, {String? listStatus}) {
  final meta = parseFleetTaskMeta(task, listStatus: listStatus);
  return meta.isFleetTask ? meta : null;
}
