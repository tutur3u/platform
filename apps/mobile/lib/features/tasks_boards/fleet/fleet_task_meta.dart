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
  const FleetTaskLink({required this.kind, required this.value});

  /// `pr`, `commit`, `thread` or another lowercase kind.
  final String kind;
  final String value;

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
  List<Object?> get props => [kind, value];
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
    this.links = const [],
  });

  /// The block is present or a fleet label prefix is present.
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
  final List<FleetTaskLink> links;

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

/// Reads the fleet metadata of [task] from its description block, falling
/// back to labels, the native priority and the end date.
FleetTaskMeta parseFleetTaskMeta(TaskBoardTask task) {
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
  final hasFleetLabel =
      labelNeedsUser ||
      hasLabel('state:') ||
      hasLabel('owner:') ||
      hasLabel('product:');

  final status =
      FleetStatus.tryParse(fields['status'] ?? fields['state']) ??
      FleetStatus.tryParse(labelValue('state:'));
  final needsUser =
      _parseBool(fields['needs_user']) ??
      (labelNeedsUser || status == FleetStatus.needsUser);
  final priority = normalizeFleetKey(fields['priority']);
  final nativePriority = normalizeFleetKey(task.priority);

  return FleetTaskMeta(
    isFleetTask: hasBlock || hasFleetLabel,
    hasBlock: hasBlock,
    status: status,
    owner: fields['owner'] ?? labelValue('owner:'),
    product: fields['product'] ?? labelValue('product:'),
    priority: _priorities.contains(priority)
        ? priority
        : (_priorities.contains(nativePriority) ? nativePriority : null),
    eta: _parseDate(fields['eta']) ?? task.endDate,
    lastUpdate: _parseDate(fields['last_update']),
    needsUser: needsUser,
    needsUserReason: fields['needs_user_reason'],
    blockedBy: fields['blocked_by'],
    links: [
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
FleetTaskMeta? fleetMetaOrNull(TaskBoardTask task) {
  final meta = parseFleetTaskMeta(task);
  return meta.isFleetTask ? meta : null;
}
