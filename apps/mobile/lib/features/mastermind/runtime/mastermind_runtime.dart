import 'dart:async';

import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_refresh_scheduler.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_connectivity.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/data/snapshot_store_factory.dart';
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
    MastermindSnapshotSource? source,
    MastermindReplyTransport? replyTransport,
    Stream<bool>? onlineChanges,
  }) : replies = replies ?? MastermindRepliesCubit(store: MemoryOutboxStore()),
       _source = source,
       _replyTransport = replyTransport {
    _accessSub = access.stream.listen(_onAccess);
    _snapshotSub = snapshot.stream.listen(_onSnapshot);
    // A connectivity plugin error only means the device stays assumed online.
    _onlineSub = onlineChanges?.listen((online) {
      scheduler.setOnline(online: online);
      // Back online: queued replies go out without waiting for a screen.
      if (online) unawaited(this.replies.flush());
    }, onError: (Object _) {});
  }

  /// Fixture or live source per build configuration; see
  /// [createMastermindSnapshotSource].
  factory MastermindRuntime.create({
    required String? Function() userId,
    WorkspacePermissionsRepository? permissions,
    MastermindSnapshotSource? source,
    MastermindSnapshotStore? store,
    MastermindReplyTransport? replyTransport,
    MastermindOutboxStore? outboxStore,
    Stream<bool>? onlineChanges,
  }) {
    final resolved = source ?? createMastermindSnapshotSource();
    final cubit = MastermindSnapshotCubit(
      source: resolved,
      store: store ?? createMastermindSnapshotStore(userId: userId),
    );
    final scheduler = MastermindRefreshScheduler.forCubit(cubit);
    final transport =
        replyTransport ??
        (source == null ? createMastermindReplyTransport() : null);
    return MastermindRuntime(
      access: MastermindAccessCubit(
        repository: permissions ?? WorkspacePermissionsRepository(),
        source: resolved,
      ),
      snapshot: cubit,
      scheduler: scheduler,
      replies: MastermindRepliesCubit(
        store: outboxStore ?? createMastermindOutboxStore(userId: userId),
        transport: transport,
        fetchCapabilities: resolved is HubHttpSnapshotSource
            ? resolved.fetchCapabilities
            : null,
        refreshSnapshot: scheduler.refreshNow,
        onAccessLost: (kind) => cubit.handleCapabilitiesUnavailable(
          CapabilitiesFetchUnavailable(kind),
        ),
      ),
      source: resolved,
      replyTransport: transport,
      onlineChanges: onlineChanges ?? mastermindOnlineChanges(),
    );
  }

  final MastermindAccessCubit access;
  final MastermindSnapshotCubit snapshot;
  final MastermindRefreshScheduler scheduler;
  final MastermindRepliesCubit replies;
  final MastermindSnapshotSource? _source;
  final MastermindReplyTransport? _replyTransport;
  late final StreamSubscription<MastermindAccessState> _accessSub;
  late final StreamSubscription<MastermindSnapshotState> _snapshotSub;
  late final StreamSubscription<bool>? _onlineSub;

  // Losing access erases the held snapshot, memory and disk.
  void _onAccess(MastermindAccessState state) {
    if (state.status == MastermindAccessStatus.loaded &&
        !state.enabled &&
        snapshot.state is! MastermindSnapshotInitial) {
      unawaited(snapshot.clear());
    }
  }

  // A 403 hides the module until the next access sync, without pulling the
  // screen away from the explanation. Queued replies follow the snapshot: they
  // are erased with it, and a live snapshot tells which items are still open.
  void _onSnapshot(MastermindSnapshotState state) {
    switch (state) {
      case MastermindSnapshotReady():
        replies.syncSnapshot(state);
      case MastermindSnapshotInitial():
        unawaited(replies.clear());
      case MastermindSnapshotUnavailable(:final kind) when kind.isAccessLost:
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
    await Future.wait([snapshot.clear(), replies.clear()]);
    await synced;
  }

  /// App resume: a failed access check (offline, a Worker blip) must not hide
  /// the module until the next workspace change.
  Future<void> retryAccessAfterError(String? wsId) async {
    if (access.state.status == MastermindAccessStatus.error) {
      await access.sync(wsId);
    }
  }

  Future<void> close() async {
    await _onlineSub?.cancel();
    await _accessSub.cancel();
    await _snapshotSub.cancel();
    scheduler.dispose();
    await replies.close();
    await snapshot.close();
    await access.close();
    if (_source case final HubHttpSnapshotSource live) live.close();
    if (_replyTransport case final HubReplyTransport live) live.close();
  }
}
