import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/asks/ask_detail_source.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_refresh_scheduler.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

import 'mastermind_snapshot_builder.dart';

const testDigest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/// Two minutes after the synthetic snapshot's `generated_at`.
final testNow = DateTime.utc(2026, 1, 31, 17, 32);

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

Uint8List snapshotBytes(Map<String, dynamic> json) =>
    Uint8List.fromList(utf8.encode(jsonEncode(json)));

final class FakeHubSource implements MastermindSnapshotSource {
  FakeHubSource({this.configured = true, Uint8List? bytes})
    : bytes = bytes ?? MastermindSnapshotBuilder.defaults().bytes();

  bool configured;
  Uint8List bytes;
  Future<SnapshotFetch> Function()? fetcher;
  int calls = 0;

  @override
  bool get isConfigured => configured;

  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) {
    calls++;
    final custom = fetcher;
    if (custom != null) return custom();
    return Future.value(SnapshotFetch.ok(bytes, testNow, digest: testDigest));
  }

  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async =>
      const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
}

enum TestAccess { enabled, disabled, loading, error }

final class _ManualTimer implements Timer {
  _ManualTimer(this._callback);
  final void Function() _callback;
  bool _active = true;

  @override
  bool get isActive => _active;
  @override
  int get tick => _active ? 0 : 1;
  @override
  void cancel() => _active = false;

  void fire() {
    _active = false;
    _callback();
  }
}

/// The real cubits, scheduler and runtime over a fake hub, with no real
/// timers, isolates or disk.
final class MastermindViewHarness {
  MastermindViewHarness({
    FakeHubSource? source,
    MastermindRepliesCubit? replies,
    MastermindAnsweredElsewhereCubit? answered,
    MastermindAskDetailSource? askDetails,
    Stream<bool>? onlineChanges,
  }) : source = source ?? FakeHubSource() {
    access = MastermindAccessCubit(
      repository: permissions,
      source: this.source,
    );
    snapshot = MastermindSnapshotCubit(
      source: this.source,
      store: store,
      clock: () => testNow,
      parser: (bytes) async => parseMastermindSnapshot(bytes),
    );
    scheduler = MastermindRefreshScheduler.forCubit(
      snapshot,
      timerFactory: (delay, callback) => _ManualTimer(callback),
    );
    runtime = MastermindRuntime(
      access: access,
      snapshot: snapshot,
      scheduler: scheduler,
      replies: replies,
      answered: answered,
      askDetails: askDetails,
      onlineChanges: onlineChanges,
    );
  }

  final FakeHubSource source;
  final permissions = _Permissions();
  final store = MemorySnapshotStore();
  late final MastermindAccessCubit access;
  late final MastermindSnapshotCubit snapshot;
  late final MastermindRefreshScheduler scheduler;
  late final MastermindRuntime runtime;

  /// Drives the real access cubit into one of its observable states.
  Future<void> setAccess(TestAccess mode) async {
    When<Future<WorkspacePermissions>> stub() =>
        when(() => permissions.getPermissions(wsId: rootWorkspaceId));
    switch (mode) {
      case TestAccess.enabled:
        stub().thenAnswer(
          (_) async => const WorkspacePermissions(
            permissions: {'view_infrastructure'},
            isCreator: false,
          ),
        );
        await access.sync(rootWorkspaceId);
      case TestAccess.disabled:
        await access.sync('other-workspace');
      case TestAccess.loading:
        stub().thenAnswer((_) => Completer<WorkspacePermissions>().future);
        unawaited(access.sync(rootWorkspaceId));
      case TestAccess.error:
        stub().thenThrow(Exception('permissions unavailable'));
        await access.sync(rootWorkspaceId);
    }
  }

  Widget wrap(Widget child) => MultiBlocProvider(
    providers: [
      BlocProvider<MastermindAccessCubit>.value(value: access),
      BlocProvider<MastermindSnapshotCubit>.value(value: snapshot),
      RepositoryProvider<MastermindRuntime>.value(value: runtime),
    ],
    child: child,
  );

  Future<void> dispose() => runtime.close();
}
