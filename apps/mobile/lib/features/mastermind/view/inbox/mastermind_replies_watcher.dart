import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';

/// Keeps the reply path warm while an Inbox screen is mounted: asks the hub
/// whether replies are on, and sends anything queued on the device, when the
/// screen opens and every time the app comes back to the foreground.
class MastermindRepliesWatcher extends StatefulWidget {
  const MastermindRepliesWatcher({required this.child, super.key});

  final Widget child;

  static MastermindRepliesCubit cubitOf(BuildContext context) =>
      context.read<MastermindRuntime>().replies;

  @override
  State<MastermindRepliesWatcher> createState() =>
      _MastermindRepliesWatcherState();
}

class _MastermindRepliesWatcherState extends State<MastermindRepliesWatcher>
    with WidgetsBindingObserver {
  late final MastermindRepliesCubit _replies = MastermindRepliesWatcher.cubitOf(
    context,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_wake());
  }

  Future<void> _wake() async {
    await _replies.loadCapabilities();
    await _replies.flush();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_wake());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
