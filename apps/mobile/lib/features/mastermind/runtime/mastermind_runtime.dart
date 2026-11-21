import 'dart:async';
import 'dart:ui' show AppLifecycleState;

import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_repository.dart';
import 'package:mobile/features/mastermind/asks/ask_detail_source.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_refresh_scheduler.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_connectivity.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/data/snapshot_store_factory.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_fetch_clock_store.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_outbox_store.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_snooze_store.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_cache.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay_factory.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/projects/data/projects_id_store.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/hub_reply_transport.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_factories.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

/// The app-lifetime owner of everything Mastermind holds: the source, the
/// per-user cache, both cubits and the refresh scheduler.
///
/// Mastermind screens only attach to and detach from [scheduler]; they never
/// close any of this. [close] runs once, when the app is torn down.
final class MastermindRuntime {
  MastermindRuntime({
    required this.access,
    required this.snapshot,
    required this.scheduler,
    MastermindRepliesCubit? replies,
    MastermindAnsweredElsewhereCubit? answered,
    MastermindSnapshotSource? source,
    MastermindReplyTransport? replyTransport,
    this.askDetails,
    IrisRelay? iris,
    this.irisTrust,
    this.threadCache,
    this.projectIds,
    this.userId,
    FleetCubit? fleet,
    FleetSnoozeStore? fleetSnoozeStore,
    FleetOutboxStore? fleetOutboxStore,
    FleetFetchClockStore? fleetFetchClockStore,
    FleetAccessCubit? fleetAccess,
    Stream<bool>? onlineChanges,
    Stream<void>? mastermindPushes,
  }) : _fleet = fleet,
       _fleetOutboxStore = fleetOutboxStore,
       _fleetFetchClockStore = fleetFetchClockStore,
       fleetAccess =
           fleetAccess ?? FleetAccessCubit(source: FleetAccessRepository()),
       _fleetSnoozeStore = fleetSnoozeStore,
       iris = iris ?? const UnconfiguredIrisRelay(),
       replies = replies ?? MastermindRepliesCubit(store: MemoryOutboxStore()),
       answered = answered ?? MastermindAnsweredElsewhereCubit(),
       _source = source,
       _replyTransport = replyTransport {
    _accessSub = access.stream.listen(_onAccess);
    _snapshotSub = snapshot.stream.listen(_onSnapshot);
    // A connectivity plugin error only means the device stays assumed online.
    // Repeats (several interfaces changing at once) are one change: each
    // `true` would otherwise force another capability check and flush.
    _onlineSub = onlineChanges?.distinct().listen((online) {
      scheduler.setOnline(online: online);
      // Back online: queued replies go out without waiting for a screen, once
      // the hub confirms replies are still on.
      if (online) {
        unawaited(this.replies.flush(recheckCapabilities: true));
        _fleet?.retryNow();
      }
    }, onError: (Object _) {});
    // A Mastermind push (a new decision awaiting the owner, received or
    // tapped) means the fleet snapshot on screen is behind.
    _pushSub = mastermindPushes?.listen(
      (_) => refreshFleet(),
      onError: (Object _) {},
    );
  }

  /// Fixture or live source per build configuration; see
  /// [createMastermindSnapshotSource].
  factory MastermindRuntime.create({
    required String? Function() userId,
    bool Function(String wsId)? isPersonalWorkspace,
    MastermindAccessRepository? accessRepository,
    MastermindSnapshotSource? source,
    MastermindSnapshotStore? store,
    MastermindReplyTransport? replyTransport,
    MastermindOutboxStore? outboxStore,
    MastermindAskDetailSource? askDetails,
    IrisRelay? iris,
    IrisDeviceTrust? irisTrust,
    Stream<bool>? onlineChanges,
    Stream<void>? mastermindPushes,
  }) {
    final resolved = source ?? createMastermindSnapshotSource();
    final trust =
        irisTrust ??
        (iris == null && source == null ? IrisDeviceTrust.platform : null);
    final cubit = MastermindSnapshotCubit(
      source: resolved,
      store: store ?? createMastermindSnapshotStore(userId: userId),
    );
    final scheduler = MastermindRefreshScheduler.forCubit(cubit);
    final transport =
        replyTransport ??
        (source == null ? createMastermindReplyTransport() : null);
    final answered = MastermindAnsweredElsewhereCubit();
    return MastermindRuntime(
      access: MastermindAccessCubit(
        repository:
            accessRepository ?? MastermindAccessRepository(userId: userId),
        source: resolved,
        isPersonalWorkspace: isPersonalWorkspace,
      ),
      snapshot: cubit,
      scheduler: scheduler,
      replies: MastermindRepliesCubit(
        store: outboxStore ?? createMastermindOutboxStore(userId: userId),
        transport: transport,
        fetchCapabilities: resolved is HubHttpSnapshotSource
            ? () => _readIrisCapability(resolved.fetchCapabilities())
            : null,
        refreshSnapshot: scheduler.refreshNow,
        onAccessLost: (kind) => cubit.handleCapabilitiesUnavailable(
          CapabilitiesFetchUnavailable(kind),
        ),
        isAnsweredElsewhere: answered.isAnswered,
      ),
      answered: answered,
      source: resolved,
      replyTransport: transport,
      askDetails:
          askDetails ??
          (source == null ? createMastermindAskDetailSource() : null),
      iris: iris ?? (source == null ? createIrisRelay(trust: trust) : null),
      irisTrust: trust,
      fleetSnoozeStore: PrefsFleetSnoozeStore(userId: userId),
      fleetOutboxStore: createFleetOutboxStore(userId: userId),
      fleetFetchClockStore: PrefsFleetFetchClockStore(userId: userId),
      threadCache: createFleetThreadCache(userId: userId),
      projectIds: const PrefsProjectsIdStore(),
      userId: userId,
      onlineChanges: onlineChanges ?? mastermindOnlineChanges(),
      mastermindPushes: mastermindPushes,
    );
  }

  /// The same capabilities check turns Iris on or off: only an accepted body
  /// changes it, so a failed check never flips the flag.
  static Future<CapabilitiesFetch> _readIrisCapability(
    Future<CapabilitiesFetch> fetch,
  ) async {
    final result = await fetch;
    if (result case CapabilitiesFetchOk(:final capabilities)) {
      mastermindIrisCapability.value = capabilities.iris;
      mastermindIrisSendCapability.value = capabilities.irisSend;
    }
    return result;
  }

  final MastermindAccessCubit access;

  /// The Fleet view's own gate, separate from [access]: anyone Web grants
  /// Fleet access, in any workspace. It asks only when a Fleet entry point or
  /// the Fleet route needs the answer.
  final FleetAccessCubit fleetAccess;
  final MastermindSnapshotCubit snapshot;
  final MastermindRefreshScheduler scheduler;
  final MastermindRepliesCubit replies;

  /// Open asks answered elsewhere, lingering on screen before they move on.
  final MastermindAnsweredElsewhereCubit answered;

  /// The optional full-ask read; null unless `MASTERMIND_ASK_DETAILS` is on
  /// and a live hub is configured.
  final MastermindAskDetailSource? askDetails;

  /// The Iris relay (chat feed, composer, devices); unconfigured without a
  /// hub or fixture.
  final IrisRelay iris;

  /// This device's Iris key, when it can hold one. Its read session ends when
  /// the app leaves the foreground, and its key and enrolment go with the
  /// account on logout or account switch.
  final IrisDeviceTrust? irisTrust;

  /// The owner's last thread lists on this device, for the offline view;
  /// cleared for the account that signs out.
  final FleetThreadCache? threadCache;

  /// The ids that find [threadCache]'s lists after a restart; cleared with
  /// it.
  final ProjectsIdStore? projectIds;

  /// The signed-in account, read live; null while signed out.
  final String? Function()? userId;

  /// The live fleet snapshot behind Today, Inbox and Work. Created on first
  /// use so a runtime that never shows a fleet tab opens no API client.
  /// Answers wait [fleetUndoWindow] before they are sent, so Undo is real.
  FleetCubit get fleet => _fleet ??= FleetCubit(
    source: FleetRepository(),
    outbox: _fleetOutboxStore,
    fetchClock: _fleetFetchClockStore,
    undoWindow: fleetUndoWindow,
  );
  FleetCubit? _fleet;
  final FleetOutboxStore? _fleetOutboxStore;
  final FleetFetchClockStore? _fleetFetchClockStore;

  static const fleetUndoWindow = Duration(seconds: 5);

  /// Inbox snoozes, kept on this device per user.
  FleetSnoozeCubit get fleetSnoozes =>
      _fleetSnoozes ??= FleetSnoozeCubit(store: _fleetSnoozeStore);
  FleetSnoozeCubit? _fleetSnoozes;
  final FleetSnoozeStore? _fleetSnoozeStore;

  final MastermindSnapshotSource? _source;
  final MastermindReplyTransport? _replyTransport;
  late final StreamSubscription<MastermindAccessState> _accessSub;
  late final StreamSubscription<MastermindSnapshotState> _snapshotSub;
  late final StreamSubscription<bool>? _onlineSub;
  late final StreamSubscription<void>? _pushSub;

  // Losing access erases the held snapshot, memory and disk.
  void _onAccess(MastermindAccessState state) {
    if (state.status == MastermindAccessStatus.loaded && !state.enabled) {
      _fleet?.clear();
      _fleetSnoozes?.clear();
      if (snapshot.state is! MastermindSnapshotInitial) {
        unawaited(snapshot.clear());
      }
    }
  }

  // A 403 hides the module until the next access sync, without pulling the
  // screen away from the explanation. Queued replies follow the snapshot: they
  // are erased with it, and a live snapshot tells which items are still open.
  void _onSnapshot(MastermindSnapshotState state) {
    switch (state) {
      case MastermindSnapshotReady():
        // First: syncing replies cancels the undo window this reads.
        answered.observe(state, replies.state);
        replies.syncSnapshot(state);
      case MastermindSnapshotInitial():
        answered.clear();
        unawaited(replies.clear());
      case MastermindSnapshotUnavailable(:final kind) when kind.isAccessLost:
        answered.clear();
        unawaited(replies.clear());
        if (kind == SnapshotUnavailableKind.forbidden) access.markForbidden();
      default:
        break;
    }
  }

  /// Logout or account switch: erase the cache and re-check access for the
  /// workspace now selected ([wsId] is null after logout).
  Future<void> reset({String? wsId}) async {
    // Sync first: for the root workspace it emits `loading` synchronously, so a
    // deep link on screen is held rather than redirected during the switch.
    final synced = access.sync(wsId);
    fleetAccess.reset();
    answered.clear();
    _fleet?.clear();
    _fleetSnoozes?.clear();
    await Future.wait([
      snapshot.clear(),
      replies.clear(),
      if (irisTrust case final trust?) trust.forget(),
    ]);
    await synced;
  }

  /// Hidden or paused ends the Iris read session; resumed lets reads prompt
  /// again. Not `inactive`: the biometric prompt itself makes iOS inactive,
  /// and a lock queued behind that sign would drop the session it just
  /// opened, so every poll would prompt again.
  void irisLifecycle(AppLifecycleState state) {
    final trust = irisTrust;
    if (trust == null) return;
    switch (state) {
      case AppLifecycleState.hidden || AppLifecycleState.paused:
        unawaited(trust.lock());
      case AppLifecycleState.resumed:
        trust.resumeReads();
      case AppLifecycleState.inactive || AppLifecycleState.detached:
        break;
    }
  }

  /// A push tap opened Mastermind: fetch the fleet now instead of waiting
  /// for the next poll, and resend any answer waiting to retry.
  void refreshFleet() {
    final fleet = _fleet;
    if (fleet == null) return;
    fleet.retryNow();
    unawaited(fleet.refresh());
  }

  /// App resume: a failed access check (offline, a Worker blip) must not hide
  /// the module, or the Fleet access entry, until the next workspace change.
  Future<void> retryAccessAfterError(String? wsId) async {
    await Future.wait([
      if (access.state.status == MastermindAccessStatus.error)
        access.sync(wsId),
      if (fleetAccess.state.status == FleetAccessStatus.error)
        fleetAccess.sync(),
    ]);
  }

  Future<void> close() async {
    await _onlineSub?.cancel();
    await _pushSub?.cancel();
    await _accessSub.cancel();
    await _snapshotSub.cancel();
    scheduler.dispose();
    await replies.close();
    await answered.close();
    await _fleet?.close();
    await _fleetSnoozes?.close();
    await snapshot.close();
    await access.close();
    await fleetAccess.close();
    if (_source case final HubHttpSnapshotSource live) live.close();
    if (_replyTransport case final HubReplyTransport live) live.close();
    if (askDetails case final HubAskDetailSource live) live.close();
    if (iris case final HttpIrisRelay live) live.close();
  }
}
