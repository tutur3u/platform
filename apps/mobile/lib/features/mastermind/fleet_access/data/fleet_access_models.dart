import 'package:equatable/equatable.dart';

// Wire contract: apps/docs/reference/api-reference/fleet-access.mdx. Every
// parser is strict and throws [FormatException] on anything else, so a newer
// or broken server answer reads as "unreadable", never as partial data.

final _projectKey = RegExp(r'^[a-z0-9][a-z0-9_-]{0,63}$');
final _instant = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$');
final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

Never _invalid(String what) => throw FormatException('Invalid Fleet $what');

Map<String, Object?> _map(Object? json, String what) =>
    json is Map<String, Object?> ? json : _invalid(what);

T _enum<T extends Enum>(List<T> values, Object? wire, String what) =>
    values.where((v) => _wire(v) == wire).firstOrNull ?? _invalid(what);

String _wire(Enum value) =>
    value is FleetWireValue ? (value as FleetWireValue).wire : value.name;

DateTime _time(Object? value, String what) =>
    value is String && _instant.hasMatch(value)
    ? DateTime.parse(value)
    : _invalid(what);

String _key(Object? value, String what) =>
    value is String && _projectKey.hasMatch(value) ? value : _invalid(what);

String _text(Object? value, String what, {int max = 120}) =>
    value is String && value.isNotEmpty && value.length <= max
    ? value
    : _invalid(what);

/// An enum whose wire spelling differs from its Dart name.
abstract interface class FleetWireValue {
  String get wire;
}

enum FleetTier { observer, steerer, operator, owner }

/// The live answer of `GET /api/v1/fleet/access`. Cosmetic: it only decides
/// whether the Fleet view shows; the API enforces every rule.
final class FleetAccess extends Equatable {
  const FleetAccess({
    required this.enabled,
    this.tier,
    this.projects = const [],
    this.capabilities = const {},
    this.stopped = false,
  });

  const FleetAccess.disabled() : this(enabled: false);

  factory FleetAccess.parse(Object? json) {
    final map = _map(json, 'access');
    final enabled = map['enabled'];
    final stopped = map['stopped'];
    if (enabled is! bool || stopped is! bool) _invalid('access');
    if (!enabled) return FleetAccess(enabled: false, stopped: stopped);
    final projects = map['projects'];
    final capabilities = map['capabilities'];
    if (projects is! List || capabilities is! List || stopped) {
      _invalid('access');
    }
    return FleetAccess(
      enabled: true,
      tier: _enum(FleetTier.values, map['tier'], 'tier'),
      projects: [for (final key in projects) _key(key, 'access')],
      // Capabilities this build does not know are kept: they only ever
      // widen what the server already allows, and the app decides nothing.
      capabilities: {for (final c in capabilities) _text(c, 'capability')},
    );
  }

  final bool enabled;
  final FleetTier? tier;
  final List<String> projects;
  final Set<String> capabilities;
  final bool stopped;

  bool can(String capability) => capabilities.contains(capability);

  /// Whether this grant can approve anything, so Approvals has a reason to
  /// show.
  bool get approves => const {
    'approve.low',
    'approve.deploy',
    'approve.production_change',
  }.any(capabilities.contains);

  @override
  List<Object?> get props => [enabled, tier, projects, capabilities, stopped];
}

enum FleetLaneState { planned, running, blocked, ready, done, paused }

enum FleetBlocker implements FleetWireValue {
  dependency('dependency'),
  review('review'),
  ci('ci'),
  approval('approval'),
  releaseHold('release_hold'),
  capacity('capacity'),
  incident('incident');

  const FleetBlocker(this.wire);
  @override
  final String wire;
}

final class FleetDigestLane extends Equatable {
  const FleetDigestLane({
    required this.lane,
    required this.state,
    this.eta,
    this.shortSha,
    this.releaseTitle,
    this.readinessItem,
    this.blockers = const [],
  });

  factory FleetDigestLane.parse(Object? json) {
    final map = _map(json, 'lane');
    final sha = map['shortSha'];
    final blockers = map['blockerCodes'];
    if (blockers is! List) _invalid('lane');
    if (sha != null &&
        (sha is! String || !RegExp(r'^[0-9a-f]{7,12}$').hasMatch(sha))) {
      _invalid('lane');
    }
    return FleetDigestLane(
      lane: _text(map['lane'], 'lane'),
      state: _enum(FleetLaneState.values, map['state'], 'lane state'),
      eta: map['eta'] == null ? null : _time(map['eta'], 'eta'),
      shortSha: sha as String?,
      releaseTitle: map['releaseTitle'] == null
          ? null
          : _text(map['releaseTitle'], 'release'),
      readinessItem: map['readinessItem'] == null
          ? null
          : _text(map['readinessItem'], 'readiness'),
      blockers: [
        for (final code in blockers)
          _enum(FleetBlocker.values, code, 'blocker'),
      ],
    );
  }

  final String lane;
  final FleetLaneState state;
  final DateTime? eta;
  final String? shortSha;
  final String? releaseTitle;
  final String? readinessItem;
  final List<FleetBlocker> blockers;

  @override
  List<Object?> get props => [
    lane,
    state,
    eta,
    shortSha,
    releaseTitle,
    readinessItem,
    blockers,
  ];
}

/// One project's latest visible snapshot.
final class FleetDigestSection extends Equatable {
  const FleetDigestSection({
    required this.projectKey,
    required this.generatedAt,
    required this.receivedAt,
    required this.stale,
    this.lanes = const [],
  });

  factory FleetDigestSection.parse(Object? json) {
    final map = _map(json, 'section');
    final key = map['projectKey'];
    final stale = map['stale'];
    final lanes = map['lanes'];
    if (key is! String || !_projectKey.hasMatch(key)) _invalid('section');
    if (stale is! bool || lanes is! List) _invalid('section');
    return FleetDigestSection(
      projectKey: key,
      generatedAt: _time(map['generatedAt'], 'generatedAt'),
      receivedAt: _time(map['receivedAt'], 'receivedAt'),
      stale: stale,
      lanes: [for (final lane in lanes) FleetDigestLane.parse(lane)],
    );
  }

  /// The server marks a snapshot stale one hour after receipt.
  static const staleAfter = Duration(hours: 1);

  final String projectKey;

  /// The publisher's time.
  final DateTime generatedAt;

  /// The server's receipt time.
  final DateTime receivedAt;
  final bool stale;
  final List<FleetDigestLane> lanes;

  /// The server's flag, or an hour since receipt passing while it is held on
  /// screen.
  bool staleAt(DateTime now) =>
      stale || !now.isBefore(receivedAt.add(staleAfter));

  @override
  List<Object?> get props => [
    projectKey,
    generatedAt,
    receivedAt,
    stale,
    lanes,
  ];
}

final class FleetDigest extends Equatable {
  const FleetDigest({this.sections = const []});

  factory FleetDigest.parse(Object? json) {
    final map = _map(json, 'digest');
    final sections = map['sections'];
    if (sections is! List || map['totals'] is! Map) _invalid('digest');
    return FleetDigest(
      sections: [for (final s in sections) FleetDigestSection.parse(s)],
    );
  }

  final List<FleetDigestSection> sections;

  int count(FleetLaneState state) => sections
      .expand((s) => s.lanes)
      .where((lane) => lane.state == state)
      .length;

  int get lanes => sections.fold(0, (sum, s) => sum + s.lanes.length);

  @override
  List<Object?> get props => [sections];
}

enum FleetIntentState implements FleetWireValue {
  pendingApproval('pending_approval'),
  approved('approved'),
  rejected('rejected'),
  claimed('claimed'),
  dispatched('dispatched'),
  done('done'),
  failed('failed'),
  expired('expired'),
  cancelled('cancelled');

  const FleetIntentState(this.wire);
  @override
  final String wire;
}

enum FleetIntentKind implements FleetWireValue {
  statusQuestion('status_question', 'ask'),
  comment('comment', 'comment'),
  prioritySet('priority.set', 'priority.set'),
  approveItem('approve.item', 'approve.low'),
  workCreate('work.create', 'work.create'),
  workRedirect('work.redirect', 'work.redirect'),
  lanePause('lane.pause', 'lane.pause'),
  approveDeploy('approve.deploy', 'approve.deploy'),
  approveProductionChange(
    'approve.production_change',
    'approve.production_change',
  );

  const FleetIntentKind(this.wire, this.capability);
  @override
  final String wire;

  /// The capability that files this kind directly.
  final String capability;

  /// Offered when the grant files this kind directly, or files it as a
  /// request for the owner (`intent.request`, every Observer steer). This
  /// only trims the menu; the server decides.
  bool offeredBy(FleetAccess access) =>
      access.can(capability) ||
      (this != statusQuestion && access.can('intent.request'));

  /// Offered only as a request for the owner, who must approve the exact
  /// action before anything runs.
  bool needsOwnerApproval(FleetAccess access) =>
      offeredBy(access) && !access.can(capability);
}

/// A requester receipt from `GET /api/v1/fleet/intents`.
final class FleetIntentReceipt extends Equatable {
  const FleetIntentReceipt({
    required this.id,
    required this.kind,
    required this.state,
    required this.createdAt,
  });

  factory FleetIntentReceipt.parse(Object? json) {
    final map = _map(json, 'receipt');
    final id = map['id'];
    if (id is! String || !_uuid.hasMatch(id)) {
      _invalid('receipt');
    }
    return FleetIntentReceipt(
      id: id,
      kind: _enum(FleetIntentKind.values, map['kind'], 'kind'),
      state: _enum(FleetIntentState.values, map['state'], 'state'),
      createdAt: _time(map['createdAt'], 'createdAt'),
    );
  }

  final String id;
  final FleetIntentKind kind;
  final FleetIntentState state;
  final DateTime createdAt;

  @override
  List<Object?> get props => [id, kind, state, createdAt];
}

final class FleetIntentPage {
  const FleetIntentPage({required this.intents, this.nextBefore});

  factory FleetIntentPage.parse(Object? json) {
    final map = _map(json, 'receipts');
    final intents = map['intents'];
    final next = map['nextBefore'];
    if (intents is! List || intents.length > 50) _invalid('receipts');
    if (next != null && (next is! String || !_uuid.hasMatch(next))) {
      _invalid('receipts');
    }
    return FleetIntentPage(
      intents: [for (final i in intents) FleetIntentReceipt.parse(i)],
      nextBefore: next as String?,
    );
  }

  final List<FleetIntentReceipt> intents;
  final String? nextBefore;
}

enum FleetChannel { whatsapp, zalo, discord }

/// A single-use code to send to a desk in a private conversation.
final class FleetLinkCode extends Equatable {
  const FleetLinkCode({required this.code, required this.expiresAt});

  factory FleetLinkCode.parse(Object? json, DateTime now) {
    final map = _map(json, 'link code');
    final code = map['code'];
    final expiresIn = map['expiresIn'];
    if (code is! String || !fleetLinkCodePattern.hasMatch(code)) {
      _invalid('link code');
    }
    if (expiresIn is! int || expiresIn <= 0 || expiresIn > 600) {
      _invalid('link code');
    }
    return FleetLinkCode(
      code: code,
      expiresAt: now.add(Duration(seconds: expiresIn)),
    );
  }

  final String code;
  final DateTime expiresAt;

  @override
  List<Object?> get props => [code, expiresAt];
}

/// The pending (or confirmed) link's channel and the desk's account label.
/// The server never returns provider sender or conversation identifiers.
final class FleetLinkPreview extends Equatable {
  const FleetLinkPreview({
    required this.channel,
    required this.accountLabel,
    required this.linked,
  });

  factory FleetLinkPreview.parse(Object? json) {
    final map = _map(json, 'link');
    final linked = map['linked'];
    if (linked is! bool) _invalid('link');
    return FleetLinkPreview(
      channel: _enum(FleetChannel.values, map['channel'], 'channel'),
      accountLabel: _text(map['accountLabel'], 'account label', max: 80),
      linked: linked,
    );
  }

  final FleetChannel channel;
  final String accountLabel;
  final bool linked;

  @override
  List<Object?> get props => [channel, accountLabel, linked];
}

/// The shape of a link or confirmation code (43 base64url characters).
final fleetLinkCodePattern = RegExp(r'^[A-Za-z0-9_-]{43}$');

/// A server id, such as a link id as the desk shows it.
bool isFleetUuid(String value) => _uuid.hasMatch(value);
