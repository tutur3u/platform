import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/ship/ship_banners.dart';
import 'package:mobile/features/mastermind/ship/ship_data.dart';
import 'package:mobile/features/mastermind/ship/ship_list.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// `/mastermind/ship`: what is live per app and environment, the release
/// gap, and a freshness stamp on every row, read from the Cron Control ship
/// collector through Web. Polls every 30 seconds in the foreground; the
/// navbar's Check now runs the collector immediately.
class ShipLivePage extends StatelessWidget {
  const ShipLivePage({this.source, this.now, super.key});

  /// Injected by tests; the app uses the authenticated API client.
  final ShipLiveSource? source;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final overlay = AccountOverlayScope.maybeOf(context);
    final admitted = context.select<MastermindAccessCubit, bool>(
      (cubit) =>
          cubit.state.status == MastermindAccessStatus.loaded &&
          cubit.state.enabled,
    );
    return (overlay?.allowed ?? true) && admitted
        ? _ShipBody(key: ValueKey(overlay?.epoch), source: source, now: now)
        : const MastermindSkeleton();
  }
}

class _ShipBody extends StatefulWidget {
  const _ShipBody({this.source, this.now, super.key});

  final ShipLiveSource? source;
  final DateTime Function()? now;

  @override
  State<_ShipBody> createState() => _ShipBodyState();
}

class _ShipBodyState extends State<_ShipBody> with WidgetsBindingObserver {
  late final ShipLiveSource _source = widget.source ?? ShipLiveSource();
  Timer? _poll;
  Future<void>? _inFlight;
  ShipSnapshot? _snapshot;
  FleetFailure? _failure;
  bool _checking = false;
  // Only the newest started read may replace what is on screen.
  int _generation = 0;
  bool _foreground = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _activate(WidgetsBinding.instance.lifecycleState);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => _activate(state);

  void _activate(AppLifecycleState? state) {
    _poll?.cancel();
    _foreground = state == null || state == AppLifecycleState.resumed;
    if (!_foreground) return;
    ForegroundRefresh.request(this, () {
      if (!mounted || !_foreground) return;
      _poll?.cancel();
      unawaited(_refresh());
      _poll = Timer.periodic(
        const Duration(seconds: 30),
        (_) => unawaited(_refresh()),
      );
    });
  }

  Future<void> _refresh() => _inFlight ??= _fetch().whenComplete(() {
    _inFlight = null;
  });

  Future<void> _fetch({bool fresh = false}) async {
    final generation = ++_generation;
    try {
      final snapshot = await _source.fetch(fresh: fresh);
      if (!mounted || generation != _generation) return;
      setState(() {
        _snapshot = snapshot;
        _failure = null;
      });
    } on Object catch (error) {
      if (!mounted || generation != _generation) return;
      final failure = FleetException.from(error).failure;
      setState(() {
        _failure = failure;
        // Without access or a snapshot nothing may stay on screen as current.
        if (failure == FleetFailure.forbidden ||
            failure == FleetFailure.notPublished) {
          _snapshot = null;
        }
      });
    }
  }

  Future<void> _check() async {
    if (_checking) return;
    setState(() => _checking = true);
    final result = await _source.check();
    if (!mounted) return;
    setState(() => _checking = false);
    final l10n = context.l10n;
    showAppToast(
      context,
      variant: result.state == ShipCheckState.checked
          ? AppAlertVariant.success
          : AppAlertVariant.neutral,
      message: switch (result.state) {
        ShipCheckState.checked => l10n.mastermindShipLiveCheckDone,
        ShipCheckState.rateLimited => l10n.mastermindShipLiveCheckLimited(
          '${result.retryAfter?.inSeconds ?? 30}',
        ),
        ShipCheckState.stopped => l10n.mastermindShipLiveCheckStopped,
        ShipCheckState.disabled => l10n.mastermindShipLiveCheckDisabled,
        ShipCheckState.unconfigured => l10n.mastermindShipLiveCheckUnconfigured,
        ShipCheckState.failed => l10n.mastermindShipLiveCheckFailed,
      },
    );
    // A fresh read of its own, after any read already running; polls and
    // pull-to-refresh started meanwhile join it instead of racing it.
    await _inFlight;
    if (!mounted) return;
    await (_inFlight = _fetch(fresh: true).whenComplete(() {
      _inFlight = null;
    }));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final body = switch ((_snapshot, _failure)) {
      (final ShipSnapshot snapshot, _) => NovaRefreshIndicator(
        onRefresh: _refresh,
        child: ShipList(
          snapshot: snapshot,
          checking: _checking,
          refreshFailed: _failure != null,
          onRetry: () => unawaited(_refresh()),
          onCheck: () => unawaited(_check()),
          now: widget.now,
        ),
      ),
      (null, FleetFailure.notPublished) => NovaRefreshIndicator.state(
        onRefresh: _refresh,
        child: const ShipEmptyState(),
      ),
      (null, final FleetFailure failure) => NovaRefreshIndicator.state(
        onRefresh: _refresh,
        child: FleetFailureMessage(
          failure: failure,
          onRetry: () => unawaited(_refresh()),
        ),
      ),
      (null, null) => const MastermindSkeleton(),
    };
    return Stack(
      children: [
        Positioned.fill(child: body),
        ShellChromeActions(
          ownerId: 'mastermind-ship',
          locations: const {Routes.mastermindShip},
          actions: [
            ShellActionSpec(
              id: 'mastermind-ship-check',
              icon: LucideIcons.refreshCw,
              tooltip: context.l10n.mastermindShipLiveCheckNow,
              isLoading: _checking,
              enabled: !_checking,
              callbackToken: '$_checking',
              onPressed: () => unawaited(_check()),
            ),
          ],
        ),
      ],
    );
  }
}
