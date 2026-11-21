/// Fleet sync v1: the live fleet snapshot Web serves at
/// `GET /api/v1/mastermind/fleet/state`. Web validates and scrubs it; the
/// parser stays tolerant per entry so one unexpected row never blanks the
/// screen. See apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
library;

part 'fleet_alerts.dart';
part 'fleet_login.dart';
part 'fleet_release.dart';

enum FleetLaneState { running, waiting, queued, idle, failed }

enum FleetMachineStatus { online, stale, offline }

enum FleetUrgency { urgent, high, normal, fyi }

enum FleetOrchestratorState { running, waiting, idle, offline }

enum FleetAnswerAction {
  approve('approve'),
  hold('hold'),
  reply('reply'),

  /// "I signed in" on an open login request.
  signedIn('signed_in');

  const FleetAnswerAction(this.wire);

  /// The contract value; [name] differs where the wire uses snake case.
  final String wire;
}

/// `ask` is the default; `login` is an access request with a [FleetLogin].
enum FleetDecisionKind { ask, login }

T? _enum<T extends Enum>(List<T> values, Object? raw) {
  for (final value in values) {
    if (value.name == raw) return value;
  }
  return null;
}

FleetAnswerAction? _action(Object? raw) =>
    FleetAnswerAction.values.where((a) => a.wire == raw).firstOrNull;

String? _string(Object? raw) =>
    raw is String && raw.trim().isNotEmpty ? raw : null;

DateTime? _time(Object? raw) =>
    raw is String ? DateTime.tryParse(raw)?.toUtc() : null;

int _count(Object? raw) => raw is int && raw >= 0 ? raw : 0;

List<T> _list<T>(Object? raw, T? Function(Map<String, dynamic>) parse) => [
  if (raw is List)
    for (final entry in raw)
      if (entry is Map<String, dynamic>) ?parse(entry),
];

class FleetLane {
  const FleetLane({
    required this.id,
    required this.title,
    required this.machineId,
    required this.state,
    required this.updatedAt,
    this.project,
    this.provider,
    this.model,
    this.parentId,
    this.startedAt,
  });

  static FleetLane? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final title = _string(json['title']);
    final machineId = _string(json['machineId']);
    final state = _enum(FleetLaneState.values, json['state']);
    final updatedAt = _time(json['updatedAt']);
    if (id == null ||
        title == null ||
        machineId == null ||
        state == null ||
        updatedAt == null) {
      return null;
    }
    return FleetLane(
      id: id,
      title: title,
      machineId: machineId,
      state: state,
      updatedAt: updatedAt,
      project: _string(json['project']),
      provider: _string(json['provider']),
      model: _string(json['model']),
      parentId: _string(json['parentId']),
      startedAt: _time(json['startedAt']),
    );
  }

  final String id;
  final String title;
  final String machineId;
  final FleetLaneState state;
  final DateTime updatedAt;
  final String? project;
  final String? provider;
  final String? model;
  final String? parentId;
  final DateTime? startedAt;
}

class FleetMachine {
  const FleetMachine({
    required this.id,
    required this.label,
    required this.status,
    this.lastSeenAt,
    this.todayOutcomes,
  });

  static FleetMachine? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final label = _string(json['label']);
    final status = _enum(FleetMachineStatus.values, json['status']);
    if (id == null || label == null || status == null) return null;
    return FleetMachine(
      id: id,
      label: label,
      status: status,
      lastSeenAt: _time(json['lastSeenAt']),
      todayOutcomes: switch (json['todayOutcomes']) {
        final Map<String, dynamic> json => FleetTodayOutcomes.parse(json),
        _ => null,
      },
    );
  }

  final String id;
  final String label;
  final FleetMachineStatus status;
  final DateTime? lastSeenAt;
  final FleetTodayOutcomes? todayOutcomes;
}

class FleetTodayOutcomes {
  const FleetTodayOutcomes({
    required this.observedAt,
    required this.dayStart,
    required this.partial,
    required this.real,
    required this.quotaRecovered,
    required this.quotaUnrecovered,
    required this.unclassified,
  });

  static FleetTodayOutcomes? parse(Map<String, dynamic> json) {
    final observedAt = _time(json['observedAt']);
    final dayStart = _time(json['dayStart']);
    final kind = json['kind'];
    if (observedAt == null ||
        dayStart == null ||
        (kind != 'complete' && kind != 'partial')) {
      return null;
    }
    return FleetTodayOutcomes(
      observedAt: observedAt,
      dayStart: dayStart,
      partial: kind == 'partial',
      real: _count(json['real']),
      quotaRecovered: _count(json['quotaRecovered']),
      quotaUnrecovered: _count(json['quotaUnrecovered']),
      unclassified: _count(json['unclassified']),
    );
  }

  final DateTime observedAt;
  final DateTime dayStart;
  final bool partial;
  final int real;
  final int quotaRecovered;
  final int quotaUnrecovered;
  final int unclassified;

  bool isToday(DateTime now) =>
      !now.isBefore(dayStart) &&
      now.isBefore(dayStart.add(const Duration(days: 1)));
}

class FleetOption {
  const FleetOption({required this.id, required this.label});

  static FleetOption? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final label = _string(json['label']);
    return id == null || label == null
        ? null
        : FleetOption(id: id, label: label);
  }

  final String id;
  final String label;
}

class FleetDecision {
  const FleetDecision({
    required this.id,
    required this.title,
    required this.urgency,
    required this.createdAt,
    this.body,
    this.options = const [],
    this.recommendedOptionId,
    this.laneId,
    this.deadlineAt,
    this.kind = FleetDecisionKind.ask,
    this.why,
    this.defaultOutcome,
    this.requester,
    this.login,
  });

  /// A login request whose payload does not parse is dropped: without it the
  /// card could only offer answers Web refuses.
  static FleetDecision? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final title = _string(json['title']);
    final createdAt = _time(json['createdAt']);
    if (id == null || title == null || createdAt == null) return null;
    final kind =
        _enum(FleetDecisionKind.values, json['kind']) ?? FleetDecisionKind.ask;
    final loginJson = json['login'];
    final login =
        kind == FleetDecisionKind.login && loginJson is Map<String, dynamic>
        ? FleetLogin.parse(loginJson)
        : null;
    if (kind == FleetDecisionKind.login && login == null) return null;
    final options = _list(json['options'], FleetOption.parse);
    final recommended = _string(json['recommendedOptionId']);
    return FleetDecision(
      id: id,
      title: title,
      kind: kind,
      why: _string(json['why']),
      defaultOutcome: _string(json['defaultOutcome']),
      requester: _string(json['requester']),
      login: login,
      urgency:
          _enum(FleetUrgency.values, json['urgency']) ?? FleetUrgency.normal,
      createdAt: createdAt,
      body: _string(json['body']),
      options: options,
      recommendedOptionId: options.any((o) => o.id == recommended)
          ? recommended
          : null,
      laneId: _string(json['laneId']),
      deadlineAt: _time(json['deadlineAt']),
    );
  }

  final String id;
  final String title;
  final FleetUrgency urgency;
  final DateTime createdAt;
  final String? body;
  final List<FleetOption> options;
  final String? recommendedOptionId;
  final String? laneId;
  final DateTime? deadlineAt;
  final FleetDecisionKind kind;

  /// Why the orchestrator is asking now.
  final String? why;

  /// What happens at the deadline without an answer.
  final String? defaultOutcome;

  /// The asking agent, lane or machine.
  final String? requester;

  /// Set exactly when [kind] is [FleetDecisionKind.login].
  final FleetLogin? login;

  FleetOption? get recommended =>
      options.where((o) => o.id == recommendedOptionId).firstOrNull;
}

/// The owner's latest answer to a decision. The reply text never comes back.
class FleetAnswerReceipt {
  const FleetAnswerReceipt({
    required this.action,
    required this.revision,
    required this.answeredAt,
    required this.pickedUp,
    this.optionId,
  });

  static FleetAnswerReceipt? parse(Map<String, dynamic> json) {
    final action = _action(json['action']);
    final revision = json['revision'];
    final answeredAt = _time(json['answeredAt']);
    if (action == null || revision is! int || answeredAt == null) return null;
    return FleetAnswerReceipt(
      action: action,
      revision: revision,
      answeredAt: answeredAt,
      pickedUp: json['pickedUp'] == true,
      optionId: _string(json['optionId']),
    );
  }

  final FleetAnswerAction action;
  final int revision;
  final DateTime answeredAt;
  final bool pickedUp;
  final String? optionId;
}

class FleetCounts {
  const FleetCounts({
    this.running = 0,
    this.waiting = 0,
    this.queued = 0,
    this.idle = 0,
    this.failed = 0,
  });

  factory FleetCounts.parse(Object? raw) {
    final json = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
    return FleetCounts(
      running: _count(json['running']),
      waiting: _count(json['waiting']),
      queued: _count(json['queued']),
      idle: _count(json['idle']),
      failed: _count(json['failed']),
    );
  }

  final int running;
  final int waiting;
  final int queued;
  final int idle;
  final int failed;

  int of(FleetLaneState state) => switch (state) {
    FleetLaneState.running => running,
    FleetLaneState.waiting => waiting,
    FleetLaneState.queued => queued,
    FleetLaneState.idle => idle,
    FleetLaneState.failed => failed,
  };
}

class FleetSnapshot {
  const FleetSnapshot({
    required this.generatedAt,
    required this.receivedAt,
    required this.orchestratorLabel,
    required this.orchestratorState,
    required this.counts,
    this.orchestratorLastActiveAt,
    this.machines = const [],
    this.lanes = const [],
    this.decisions = const [],
    this.answers = const {},
    this.resolved = const [],
    this.release,
    this.alerts = const [],
  });

  /// Throws [FormatException] only when the envelope itself is unusable.
  factory FleetSnapshot.parse(Map<String, dynamic> json) {
    final state = json['state'];
    final receivedAt = _time(json['receivedAt']);
    if (state is! Map<String, dynamic> ||
        state['version'] != 1 ||
        receivedAt == null) {
      throw const FormatException('Unsupported fleet snapshot');
    }
    final generatedAt = _time(state['generatedAt']) ?? receivedAt;
    final orchestrator = state['orchestrator'];
    final orchestratorJson = orchestrator is Map<String, dynamic>
        ? orchestrator
        : const <String, dynamic>{};
    final answers = json['answers'];
    final resolved = _list(state['resolved'], FleetResolvedDecision.parse)
      ..sort((a, b) => b.resolvedAt.compareTo(a.resolvedAt));
    final closed = {for (final r in resolved) r.id};
    return FleetSnapshot(
      generatedAt: generatedAt,
      receivedAt: receivedAt,
      orchestratorLabel: _string(orchestratorJson['label']) ?? 'Iris',
      orchestratorState:
          _enum(FleetOrchestratorState.values, orchestratorJson['state']) ??
          FleetOrchestratorState.offline,
      orchestratorLastActiveAt: _time(orchestratorJson['lastActiveAt']),
      counts: FleetCounts.parse(state['counts']),
      machines: _list(state['machines'], FleetMachine.parse),
      lanes: _list(state['lanes'], FleetLane.parse),
      // A decision listed as resolved is closed, even when a lagging
      // publisher still lists it as open: it must not stay actionable.
      decisions: _list(
        state['decisions'],
        FleetDecision.parse,
      ).where((d) => !closed.contains(d.id)).toList(),
      answers: {
        if (answers is Map<String, dynamic>)
          for (final MapEntry(:key, :value) in answers.entries)
            if (value is Map<String, dynamic>)
              if (FleetAnswerReceipt.parse(value) case final receipt?)
                key: receipt,
      },
      resolved: resolved,
      release: switch (state['release']) {
        final Map<String, dynamic> release => FleetRelease.parse(release),
        _ => null,
      },
      alerts: _list(json['alerts'], FleetAlert.parse),
    );
  }

  final DateTime generatedAt;
  final DateTime receivedAt;
  final String orchestratorLabel;
  final FleetOrchestratorState orchestratorState;
  final DateTime? orchestratorLastActiveAt;
  final FleetCounts counts;
  final List<FleetMachine> machines;
  final List<FleetLane> lanes;
  final List<FleetDecision> decisions;
  final Map<String, FleetAnswerReceipt> answers;

  /// Decisions closed in the last day, newest first, with where they went.
  final List<FleetResolvedDecision> resolved;
  final FleetRelease? release;

  /// Firing SLO burn alerts, pages first; empty when Web left them out.
  final List<FleetAlert> alerts;

  /// Page-severity burns: each counts toward what needs the owner.
  List<FleetAlert> get pageAlerts =>
      alerts.where((a) => a.severity == FleetAlertSeverity.page).toList();

  /// The "needs you" figure: open decisions plus paging burns.
  int needsYouCountAt(DateTime now) =>
      needsYouAt(now).length + pageAlerts.length;

  String? machineLabel(String? id) =>
      machines.where((m) => m.id == id).firstOrNull?.label;

  /// Decisions the owner has not answered yet, most urgent first.
  List<FleetDecision> get openDecisions =>
      decisions.where((d) => !answers.containsKey(d.id)).toList()..sort(
        (a, b) => a.urgency.index != b.urgency.index
            ? a.urgency.index - b.urgency.index
            : a.createdAt.compareTo(b.createdAt),
      );

  /// Unanswered decisions the owner can still act on at [now]: a login
  /// request that has expired or ended no longer counts.
  List<FleetDecision> needsYouAt(DateTime now) =>
      openDecisions.where((d) => d.login?.isOpenAt(now) ?? true).toList();

  /// Login requests still open at [now], answered or not: until the agent
  /// verifies a sign-in, the request keeps blocking work.
  List<FleetDecision> openLoginsAt(DateTime now) =>
      decisions.where((d) => d.login?.isOpenAt(now) ?? false).toList();

  FleetSnapshot withAnswer(String decisionId, FleetAnswerReceipt receipt) =>
      FleetSnapshot(
        generatedAt: generatedAt,
        receivedAt: receivedAt,
        orchestratorLabel: orchestratorLabel,
        orchestratorState: orchestratorState,
        orchestratorLastActiveAt: orchestratorLastActiveAt,
        counts: counts,
        machines: machines,
        lanes: lanes,
        decisions: decisions,
        answers: {...answers, decisionId: receipt},
        resolved: resolved,
        release: release,
        alerts: alerts,
      );
}
