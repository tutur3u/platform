/// Fleet threads as Web serves them under
/// `/api/v1/mastermind/fleet/threads` and `/replies`: the machines, projects,
/// threads and history of the owner's fleet, and the receipt of a reply.
/// A body that is not in the documented shape is a [FormatException], never a
/// half-filled screen. See
/// apps/docs/platform/features/mastermind-thread-replies.mdx.
library;

enum FleetThreadState { running, waiting, failed, idle }

/// `sent`: held for the machine. `delivered`: the machine put it in the thread.
enum FleetReplyState { sent, delivered, failed, expired }

/// How the machine delivered a reply; `steered` went into the running turn.
enum FleetReplyDelivery { steered, started, queued }

enum FleetMessageRole { user, assistant }

/// The `projectId` that asks for threads in no project.
const fleetNoProject = 'none';

/// The longest reply Web accepts.
const fleetReplyMaxChars = 4000;

final _machineId = RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$');
final _environmentId = RegExp(r'^\w[\w-]{0,99}$');
final _threadId = RegExp(r'^[\w:%.][\w:%.-]{0,399}$');
final _projectId = RegExp(r'^[\w:%.-]{1,400}$');
final _replyId = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

Never _bad(String what) => throw FormatException('Invalid fleet $what');

Map<String, dynamic> _map(Object? raw, String what) =>
    raw is Map<String, dynamic> ? raw : _bad(what);

List<Object?> _list(Object? raw, String what, int max) =>
    raw is List<Object?> && raw.length <= max ? raw : _bad(what);

String _id(Object? raw, RegExp shape, String what) =>
    raw is String && shape.hasMatch(raw) ? raw : _bad(what);

String? _optionalId(Object? raw, RegExp shape, String what) =>
    raw == null ? null : _id(raw, shape, what);

String _text(Object? raw, String what, int max) =>
    raw is String && raw.length <= max ? raw : _bad(what);

int _count(Object? raw, String what) =>
    raw is int && raw >= 0 ? raw : _bad(what);

int? _optionalCount(Object? raw, String what) =>
    raw == null ? null : _count(raw, what);

bool _flag(Object? raw, String what) => raw is bool ? raw : _bad(what);

/// A timestamp Web could not parse stays null rather than failing the row.
DateTime? _time(Object? raw) =>
    raw is String ? DateTime.tryParse(raw)?.toUtc() : null;

T _enum<T extends Enum>(List<T> values, Object? raw, String what) {
  for (final value in values) {
    if (value.name == raw) return value;
  }
  _bad(what);
}

class FleetThread {
  const FleetThread({
    required this.threadId,
    required this.title,
    required this.state,
    required this.itemCount,
    this.projectId,
    this.project,
    this.updatedAt,
    this.seenItemCount,
    this.lastOwnerReplyAt,
  });

  factory FleetThread.parse(Object? raw) {
    final json = _map(raw, 'thread');
    return FleetThread(
      threadId: _id(json['threadId'], _threadId, 'thread id'),
      title: _text(json['title'], 'thread title', 200),
      // Whatever id the machine has for it; only a filter needs a strict one.
      projectId: json['projectId'] == null
          ? null
          : _text(json['projectId'], 'project id', 400),
      project: json['project'] == null
          ? null
          : _text(json['project'], 'project name', 200),
      state: _enum(FleetThreadState.values, json['state'], 'thread state'),
      updatedAt: _time(json['updatedAt']),
      itemCount: _count(json['itemCount'], 'item count'),
      seenItemCount: _optionalCount(json['seenItemCount'], 'seen count'),
      lastOwnerReplyAt: _time(json['lastOwnerReplyAt']),
    );
  }

  final String threadId;
  final String title;
  final String? projectId;
  final String? project;
  final FleetThreadState state;
  final DateTime? updatedAt;
  final int itemCount;

  /// How many items the owner has seen; null until a marker exists.
  final int? seenItemCount;

  /// When the owner last wrote here; only when asked for and known.
  final DateTime? lastOwnerReplyAt;

  /// Items the owner has not seen. A thread never opened counts in full.
  int get unreadCount {
    final unread = itemCount - (seenItemCount ?? 0);
    return unread > 0 ? unread : 0;
  }

  Map<String, dynamic> toJson() => {
    'threadId': threadId,
    'title': title,
    'projectId': ?projectId,
    'project': ?project,
    'state': state.name,
    'updatedAt': updatedAt?.toIso8601String() ?? '',
    'itemCount': itemCount,
    'seenItemCount': ?seenItemCount,
    'lastOwnerReplyAt': ?lastOwnerReplyAt?.toIso8601String(),
  };
}

class FleetThreadPage {
  const FleetThreadPage({
    required this.machineId,
    required this.threads,
    required this.total,
    this.environmentId,
    this.nextCursor,
  });

  factory FleetThreadPage.parse(Object? raw) {
    final json = _map(raw, 'thread page');
    return FleetThreadPage(
      machineId: _id(json['machineId'], _machineId, 'machine id'),
      environmentId: _optionalId(
        json['environmentId'],
        _environmentId,
        'environment id',
      ),
      threads: List.unmodifiable(
        _list(json['threads'], 'threads', 100).map(FleetThread.parse),
      ),
      nextCursor: _optionalCount(json['nextCursor'], 'cursor'),
      total: _count(json['total'], 'total'),
    );
  }

  final String machineId;
  final String? environmentId;
  final List<FleetThread> threads;

  /// Pass as `cursor` for the next page; null on the last one.
  final int? nextCursor;
  final int total;

  Map<String, dynamic> toJson() => {
    'machineId': machineId,
    'environmentId': ?environmentId,
    'threads': [for (final thread in threads) thread.toJson()],
    'nextCursor': nextCursor,
    'total': total,
  };
}

class FleetStateCounts {
  const FleetStateCounts({
    required this.threadCount,
    required this.running,
    required this.waiting,
    required this.failed,
    required this.idle,
  });

  factory FleetStateCounts.parse(Object? raw) {
    final json = _map(raw, 'counts');
    final counts = _map(json['counts'], 'counts');
    return FleetStateCounts(
      threadCount: _count(json['threadCount'], 'thread count'),
      running: _count(counts['running'], 'running count'),
      waiting: _count(counts['waiting'], 'waiting count'),
      failed: _count(counts['failed'], 'failed count'),
      idle: _count(counts['idle'], 'idle count'),
    );
  }

  final int threadCount;
  final int running;
  final int waiting;
  final int failed;
  final int idle;
}

class FleetThreadProject {
  const FleetThreadProject({
    required this.projectId,
    required this.name,
    required this.counts,
    this.latestUpdatedAt,
  });

  factory FleetThreadProject.parse(Object? raw) {
    final json = _map(raw, 'project');
    return FleetThreadProject(
      projectId: _id(json['projectId'], _projectId, 'project id'),
      name: _text(json['project'], 'project name', 200),
      counts: FleetStateCounts.parse(json),
      latestUpdatedAt: _time(json['latestUpdatedAt']),
    );
  }

  final String projectId;
  final String name;
  final FleetStateCounts counts;
  final DateTime? latestUpdatedAt;
}

class FleetThreadProjects {
  const FleetThreadProjects({
    required this.machineId,
    required this.projects,
    required this.unassigned,
    required this.total,
  });

  factory FleetThreadProjects.parse(Object? raw) {
    final json = _map(raw, 'projects');
    return FleetThreadProjects(
      machineId: _id(json['machineId'], _machineId, 'machine id'),
      projects: List.unmodifiable(
        _list(json['projects'], 'projects', 200).map(FleetThreadProject.parse),
      ),
      unassigned: FleetStateCounts.parse(json['unassigned']),
      total: _count(json['total'], 'total'),
    );
  }

  final String machineId;

  /// The projects touched last, newest first; at most 200.
  final List<FleetThreadProject> projects;

  /// Threads in no project.
  final FleetStateCounts unassigned;

  /// All projects with live threads, of which [projects] holds the newest.
  final int total;
}

class FleetThreadMachine {
  const FleetThreadMachine({
    required this.label,
    required this.reachable,
    this.environmentId,
  });

  factory FleetThreadMachine.parse(Object? raw) {
    final json = _map(raw, 'machine');
    return FleetThreadMachine(
      environmentId: _optionalId(
        json['environmentId'],
        _environmentId,
        'environment id',
      ),
      label: _text(json['label'], 'machine label', 80),
      reachable: _flag(json['reachable'], 'reachable'),
    );
  }

  /// Null for the bridge machine itself.
  final String? environmentId;
  final String label;
  final bool reachable;
}

class FleetThreadMachines {
  const FleetThreadMachines({required this.machineId, required this.machines});

  factory FleetThreadMachines.parse(Object? raw) {
    final json = _map(raw, 'machines');
    return FleetThreadMachines(
      machineId: _id(json['machineId'], _machineId, 'machine id'),
      machines: List.unmodifiable(
        _list(json['machines'], 'machines', 32).map(FleetThreadMachine.parse),
      ),
    );
  }

  final String machineId;
  final List<FleetThreadMachine> machines;
}

class FleetThreadMessage {
  const FleetThreadMessage({
    required this.position,
    required this.role,
    required this.text,
    required this.truncated,
    this.at,
  });

  factory FleetThreadMessage.parse(Object? raw) {
    final json = _map(raw, 'message');
    return FleetThreadMessage(
      position: _count(json['position'], 'position'),
      role: _enum(FleetMessageRole.values, json['role'], 'role'),
      text: _text(json['text'], 'message text', 8000),
      truncated: _flag(json['truncated'], 'truncated'),
      at: _time(json['at']),
    );
  }

  final int position;
  final FleetMessageRole role;

  /// Credentials are already replaced with `[redacted]` on the machine.
  final String text;
  final bool truncated;
  final DateTime? at;
}

class FleetThreadMessages {
  const FleetThreadMessages({
    required this.thread,
    required this.messages,
    this.earlierPosition,
  });

  factory FleetThreadMessages.parse(Object? raw) {
    final json = _map(raw, 'history');
    return FleetThreadMessages(
      thread: FleetThread.parse(json['thread']),
      messages: List.unmodifiable(
        _list(json['messages'], 'messages', 50).map(FleetThreadMessage.parse),
      ),
      earlierPosition: _optionalCount(json['earlierPosition'], 'position'),
    );
  }

  final FleetThread thread;

  /// Oldest first.
  final List<FleetThreadMessage> messages;

  /// Pass as `before` for the page before this one; null at the start.
  final int? earlierPosition;
}

class FleetThreadReply {
  const FleetThreadReply({
    required this.id,
    required this.machineId,
    required this.threadId,
    required this.state,
    this.environmentId,
    this.delivery,
    this.code,
    this.createdAt,
    this.settledAt,
  });

  factory FleetThreadReply.parse(Object? raw) {
    final json = _map(raw, 'reply');
    final delivery = json['delivery'];
    final code = json['code'];
    return FleetThreadReply(
      id: _id(json['id'], _replyId, 'reply id'),
      machineId: _id(json['machineId'], _machineId, 'machine id'),
      threadId: _id(json['threadId'], _threadId, 'thread id'),
      environmentId: _optionalId(
        json['environmentId'],
        _environmentId,
        'environment id',
      ),
      state: _enum(FleetReplyState.values, json['state'], 'reply state'),
      delivery: delivery == null
          ? null
          : _enum(FleetReplyDelivery.values, delivery, 'delivery'),
      // A closed code only; anything else is dropped, never shown.
      code: code is String && RegExp(r'^[a-z][a-z0-9_]{0,63}$').hasMatch(code)
          ? code
          : null,
      createdAt: _time(json['createdAt']),
      settledAt: _time(json['settledAt']),
    );
  }

  final String id;
  final String machineId;
  final String threadId;
  final String? environmentId;
  final FleetReplyState state;
  final FleetReplyDelivery? delivery;

  /// Why a failed reply failed.
  final String? code;
  final DateTime? createdAt;
  final DateTime? settledAt;

  /// The machine has delivered, refused or outlived it.
  bool get settled => state != FleetReplyState.sent;

  /// It went into the running turn.
  bool get steered =>
      state == FleetReplyState.delivered &&
      delivery == FleetReplyDelivery.steered;
}
