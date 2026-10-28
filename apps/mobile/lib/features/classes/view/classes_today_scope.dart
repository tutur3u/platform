import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/classes/cubit/classes_today_cubit.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Provides Home's [ClassesTodayCubit] and keeps it on the current actor and
/// workspace while Education mode is active. In any other mode it stays
/// empty and never touches the network.
class ClassesTodayScope extends StatefulWidget {
  const ClassesTodayScope({
    required this.child,
    this.repository,
    this.clock,
    super.key,
  });

  final Widget child;

  @visibleForTesting
  final ClassesTodayRepository? repository;

  @visibleForTesting
  final DateTime Function()? clock;

  @override
  State<ClassesTodayScope> createState() => _ClassesTodayScopeState();
}

class _ClassesTodayScopeState extends State<ClassesTodayScope> {
  late final ClassesTodayCubit _cubit = ClassesTodayCubit(
    repository: widget.repository ?? SessionsClassesTodayRepository(),
    clock: widget.clock,
  );
  final List<StreamSubscription<Object?>> _subscriptions = [];
  late final AppLifecycleListener _lifecycle;
  ({String? userId, String? wsId})? _bound;

  @override
  void initState() {
    super.initState();
    // Dart timers pause while the device sleeps, so the midnight wake can
    // miss the day rolling over; catch up as soon as the app is back.
    _lifecycle = AppLifecycleListener(
      onResume: () => unawaited(_cubit.resume()),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_subscriptions.isNotEmpty) return;
    final mode = context.read<AudienceModeCubit?>();
    final workspace = context.read<WorkspaceCubit?>();
    final auth = context.read<AuthCubit?>();
    for (final stream in <Stream<Object?>?>[
      mode?.stream,
      workspace?.stream,
      auth?.stream,
    ]) {
      if (stream != null) _subscriptions.add(stream.listen((_) => _sync()));
    }
    _sync();
  }

  void _sync() {
    if (!mounted) return;
    final education =
        context.read<AudienceModeCubit?>()?.state.mode ==
        AudienceMode.education;
    final target = education
        ? (
            userId: context.read<AuthCubit?>()?.state.user?.id,
            wsId: context.read<WorkspaceCubit?>()?.state.currentWorkspace?.id,
          )
        : (userId: null, wsId: null);
    if (target == _bound) return;
    _bound = target;
    unawaited(_cubit.load(userId: target.userId, wsId: target.wsId));
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    unawaited(_cubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      BlocProvider.value(value: _cubit, child: widget.child);
}
