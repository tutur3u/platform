import 'dart:async';

import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_refresh_scheduler.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_connectivity.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/data/snapshot_store_factory.dart';

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
    MastermindSnapshotSource? source,
    Stream<bool>? onlineChanges,
  }) : _source = source {
    _accessSub = access.stream.listen(_onAccess);
    _snapshotSub = snapshot.stream.listen(_onSnapshot);
    // A connectivity plugin error only means the device stays assumed online.
    _onlineSub = onlineChanges?.listen(
      (online) => scheduler.setOnline(online: online),
      onError: (Object _) {},
    );
  }

  /// Fixture or live source per build configuration; see
  /// [createMastermindSnapshotSource].
  factory MastermindRuntime.create({
    required String? Function() userId,
    WorkspacePermissionsRepository? permissions,
    MastermindSnapshotSource? source,
    MastermindSnapshotStore? store,
    Stream<bool>? onlineChanges,
  }) {
    final resolved = source ?? createMastermindSnapshotSource();
    final cubit = MastermindSnapshotCubit(
      source: resolved,
      store: store ?? createMastermindSnapshotStore(userId: userId),
    );
    return MastermindRuntime(
      access: MastermindAccessCubit(
        repository: permissions ?? WorkspacePermissionsRepository(),
        source: resolved,
      ),
      snapshot: cubit,
      scheduler: MastermindRefreshScheduler.forCubit(cubit),
      source: resolved,
      onlineChanges: onlineChanges ?? mastermindOnlineChanges(),
    );
  }

  final MastermindAccessCubit access;
  final MastermindSnapshotCubit snapshot;
  final MastermindRefreshScheduler scheduler;
  final MastermindSnapshotSource? _source;
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
  // screen away from the explanation.
  void _onSnapshot(MastermindSnapshotState state) {
    if (state is MastermindSnapshotUnavailable &&
        state.kind == SnapshotUnavailableKind.forbidden) {
      access.markForbidden();
    }
  }

  /// Logout or account switch: erase the cache and re-check access for the
  /// workspace now selected ([wsId] is null after logout).
  Future<void> reset({String? wsId}) async {
    // Sync first: for the root workspace it emits `loading` synchronously, so a
    // deep link on screen is held rather than redirected during the switch.
    final synced = access.sync(wsId);
    await snapshot.clear();
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
    await snapshot.close();
    await access.close();
    if (_source case final HubHttpSnapshotSource live) live.close();
  }
}
