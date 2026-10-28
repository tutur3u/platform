import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';

typedef MastermindContentBuilder =
    Widget Function(
      BuildContext context,
      MastermindSnapshotReady ready,
      MastermindFreshness freshness,
    );

/// The body of every Mastermind tab.
///
/// Holds the route while the access check runs (a neutral skeleton, so a deep
/// link never flashes content or a redirect), then attaches the refresh
/// scheduler for as long as the screen is mounted and maps the snapshot state
/// to either [builder] or a whole-section state.
class MastermindSection extends StatelessWidget {
  const MastermindSection({required this.builder, super.key});

  final MastermindContentBuilder builder;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<MastermindAccessCubit, MastermindAccessState>(
        buildWhen: (previous, current) =>
            (previous.status == MastermindAccessStatus.loaded &&
                previous.enabled) !=
            (current.status == MastermindAccessStatus.loaded &&
                current.enabled),
        builder: (context, access) =>
            access.status == MastermindAccessStatus.loaded && access.enabled
            ? _AttachedSection(builder: builder)
            : const MastermindSkeleton(),
      );
}

class _AttachedSection extends StatefulWidget {
  const _AttachedSection({required this.builder});

  final MastermindContentBuilder builder;

  @override
  State<_AttachedSection> createState() => _AttachedSectionState();
}

class _AttachedSectionState extends State<_AttachedSection>
    with WidgetsBindingObserver {
  late final MastermindRuntime _runtime = context.read<MastermindRuntime>();
  bool _backgrounded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _runtime.scheduler.attach();
    unawaited(_runtime.snapshot.ensureLoaded());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final resumed = state == AppLifecycleState.resumed;
    _runtime.scheduler.setForeground(foreground: resumed);
    // Only `hidden`/`paused` mean the app left the screen: `inactive` alone is
    // what Control Centre, a biometric prompt or a system sheet cause.
    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused) {
      _backgrounded = true;
    }
    // Coming back from the background is a refresh trigger of its own: the
    // held snapshot may be hours old, and a backoff that grew while asleep
    // should not delay it. Returning from a mere `inactive` is not.
    if (resumed && _backgrounded) {
      _backgrounded = false;
      unawaited(_runtime.scheduler.refreshNow());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _runtime.scheduler.detach();
    super.dispose();
  }

  Future<void> _retry() => _runtime.scheduler.refreshNow();

  // The strip depends on connectivity as well as the snapshot, so it listens
  // to the scheduler's online state rather than reading it at build time.
  Widget _content(MastermindSnapshotReady ready) => RefreshIndicator(
    onRefresh: _retry,
    child: ValueListenableBuilder<bool>(
      valueListenable: _runtime.scheduler.online,
      builder: (context, online, _) => widget.builder(
        context,
        ready,
        MastermindFreshness.of(
          ready,
          clock: _runtime.snapshot.clock,
          online: online,
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<MastermindSnapshotCubit, MastermindSnapshotState>(
        bloc: _runtime.snapshot,
        builder: (context, state) => switch (state) {
          MastermindSnapshotReady() => _content(state),
          MastermindSnapshotLoading(:final previous?) => _content(previous),
          MastermindSnapshotLoading() ||
          MastermindSnapshotInitial() => const MastermindSkeleton(),
          MastermindSnapshotNotConfigured() => const MastermindNotConfigured(),
          MastermindSnapshotUnavailable(:final kind) => MastermindUnavailable(
            kind: kind,
            onRetry: () => unawaited(_retry()),
          ),
          MastermindSnapshotRejected(:final previous?, :final reason) =>
            _content(previous.withFailure(RejectedRefresh(reason))),
          MastermindSnapshotRejected(:final reason) => MastermindRejected(
            reason: reason,
            onRetry: () => unawaited(_retry()),
          ),
        },
      );
}
