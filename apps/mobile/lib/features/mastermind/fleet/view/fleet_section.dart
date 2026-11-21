import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

typedef FleetContentBuilder =
    Widget Function(
      BuildContext context,
      FleetSnapshot snapshot,
      FleetViewState state,
    );

/// The body of Today, Inbox and Work. Holds the route on a skeleton while the
/// access check runs, keeps the fleet cubit polling while mounted and in the
/// foreground, and maps load failures to whole-screen states. Pull to refresh
/// works on content and on every state.
class FleetSection extends StatelessWidget {
  const FleetSection({required this.builder, super.key});

  final FleetContentBuilder builder;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<MastermindAccessCubit, MastermindAccessState>(
        buildWhen: (previous, current) =>
            _admitted(previous) != _admitted(current),
        builder: (context, access) => _admitted(access)
            ? _AttachedFleet(builder: builder)
            : const MastermindSkeleton(),
      );

  static bool _admitted(MastermindAccessState state) =>
      state.status == MastermindAccessStatus.loaded && state.enabled;
}

class _AttachedFleet extends StatefulWidget {
  const _AttachedFleet({required this.builder});

  final FleetContentBuilder builder;

  @override
  State<_AttachedFleet> createState() => _AttachedFleetState();
}

class _AttachedFleetState extends State<_AttachedFleet>
    with WidgetsBindingObserver {
  late final FleetCubit _fleet = context.read<MastermindRuntime>().fleet;

  bool _privacyReady = false;
  bool _foreground = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    _fleet
      ..setForeground(foreground: false)
      ..attach();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _privacyReady = AccountOverlayScope.maybeOf(context)?.allowed ?? true;
    _updatePolling();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _updatePolling();
  }

  void _updatePolling() {
    if (!_foreground || !_privacyReady) {
      _fleet.setForeground(foreground: false);
      return;
    }
    ForegroundRefresh.request(this, () {
      if (mounted && _foreground && _privacyReady) {
        _fleet.setForeground(foreground: true);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _fleet.detach();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => BlocBuilder<FleetCubit, FleetViewState>(
    bloc: _fleet,
    builder: (context, state) {
      final snapshot = state.snapshot;
      if (snapshot != null) {
        return NovaRefreshIndicator(
          onRefresh: _fleet.refresh,
          child: widget.builder(context, snapshot, state),
        );
      }
      if (state.status == FleetLoadStatus.failed && state.failure != null) {
        return NovaRefreshIndicator.state(
          onRefresh: _fleet.refresh,
          child: FleetFailureMessage(
            failure: state.failure!,
            lastFetchedAt: state.lastFetchedAt,
            onRetry: () => unawaited(_fleet.refresh()),
          ),
        );
      }
      return const MastermindSkeleton();
    },
  );
}

/// Whole-screen failure before any snapshot arrived. Fixed category copy.
class FleetFailureMessage extends StatelessWidget {
  const FleetFailureMessage({
    required this.failure,
    required this.onRetry,
    this.lastFetchedAt,
    super.key,
  });

  final FleetFailure failure;
  final VoidCallback onRetry;

  /// When this device last reached the fleet, kept across restarts.
  final DateTime? lastFetchedAt;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final reached = switch (lastFetchedAt) {
      final at? => l10n.mastermindFleetLastReached(
        '${Gmt7.day(at, locale)} ${Gmt7.time(at, locale)}',
      ),
      null => null,
    };
    return switch (failure) {
      FleetFailure.forbidden => AppStateMessage(
        icon: LucideIcons.shieldOff,
        title: l10n.mastermindForbiddenTitle,
        message: l10n.mastermindForbiddenMessage,
      ),
      FleetFailure.notPublished => AppStateMessage(
        icon: LucideIcons.clock,
        title: l10n.mastermindFleetNotPublishedTitle,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
      FleetFailure.unavailable ||
      FleetFailure.challenged ||
      FleetFailure.closed ||
      FleetFailure.rejected => AppStateMessage(
        icon: LucideIcons.cloudOff,
        title: l10n.mastermindFleetUnavailableTitle,
        message: reached,
        tone: AppTone.warning,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
      FleetFailure.unreadable => AppStateMessage(
        icon: LucideIcons.triangleAlert,
        title: l10n.mastermindFleetUnreadableTitle,
        tone: AppTone.warning,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
    };
  }
}
