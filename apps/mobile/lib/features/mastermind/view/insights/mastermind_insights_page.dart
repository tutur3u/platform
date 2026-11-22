import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/features/mastermind/usage/usage_content.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

class MastermindInsightsPage extends StatelessWidget {
  const MastermindInsightsPage({this.usageSource, super.key});

  final FleetUsageSource? usageSource;

  @override
  Widget build(BuildContext context) {
    final overlay = AccountOverlayScope.maybeOf(context);
    final allowed = overlay?.allowed ?? true;
    final admitted = context.select<MastermindAccessCubit, bool>(
      (cubit) =>
          cubit.state.status == MastermindAccessStatus.loaded &&
          cubit.state.enabled,
    );
    return allowed && admitted
        ? _UsageBody(source: usageSource, key: ValueKey(overlay?.epoch))
        : const MastermindSkeleton();
  }
}

class _UsageBody extends StatefulWidget {
  const _UsageBody({required this.source, super.key});

  final FleetUsageSource? source;

  @override
  State<_UsageBody> createState() => _UsageBodyState();
}

class _UsageBodyState extends State<_UsageBody> with WidgetsBindingObserver {
  late final _defaultSource = FleetUsageSource();
  late final _live = FleetOwnerLive(
    onFrame: (frame) {
      if (frame.kind == FleetOwnerFrameKind.poke &&
          frame.payload['topic'] == 'usage') {
        unawaited(_refresh());
      }
    },
  );
  Timer? _poll;
  Future<void>? _inFlight;
  FleetUsage? _usage;
  FleetFailure? _failure;
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
    if (!_foreground) {
      _live.stop();
      return;
    }
    ForegroundRefresh.request(this, () {
      if (!mounted || !_foreground) return;
      _poll?.cancel();
      unawaited(_refresh());
      _live.start();
      _poll = Timer.periodic(
        const Duration(seconds: 15),
        (_) => unawaited(_refresh()),
      );
    });
  }

  Future<void> _refresh() => _inFlight ??= _fetch().whenComplete(() {
    _inFlight = null;
  });

  Future<void> _fetch() async {
    try {
      final usage = await (widget.source ?? _defaultSource).fetch();
      if (!mounted) return;
      setState(() {
        _usage = usage;
        _failure = null;
      });
    } on Object catch (error) {
      if (!mounted) return;
      final failure = FleetException.from(error).failure;
      setState(() {
        _failure = failure;
        if (failure == FleetFailure.forbidden ||
            failure == FleetFailure.notPublished) {
          _usage = null;
        }
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _live.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_usage case final usage?) {
      return NovaRefreshIndicator(
        onRefresh: _refresh,
        child: UsageContent(usage: usage, refreshFailed: _failure != null),
      );
    }
    if (_failure case final failure?) {
      return NovaRefreshIndicator.state(
        onRefresh: _refresh,
        child: FleetFailureMessage(
          failure: failure,
          onRetry: () => unawaited(_refresh()),
        ),
      );
    }
    return const MastermindSkeleton();
  }
}
