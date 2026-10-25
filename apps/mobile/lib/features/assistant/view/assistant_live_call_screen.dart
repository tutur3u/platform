import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_call_phase.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart';

export 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart'
    show AssistantLiveCallActions;

/// Full-screen Live call, pushed on the root navigator above the app shell.
/// Popping (Minimize or system Back) keeps the call running; the in-shell Live
/// view then offers Return to call. Once the session has started, any later
/// disconnect shows the ended summary with Call again; the owning page
/// dismisses the surface on workspace or actor changes and on teardown.
class AssistantLiveCallScreen extends StatefulWidget {
  const AssistantLiveCallScreen({
    required this.cubit,
    required this.assistantName,
    required this.actions,
    this.startAttempt,
    super.key,
  });

  static const routeName = 'assistant-live-call';

  final AssistantLiveCubit cubit;
  final String assistantName;
  final AssistantLiveCallActions actions;

  /// The page's start attempt for a new call, or null when returning to one.
  final Future<void>? startAttempt;

  /// Opens the call above the shell; completes when the surface is dismissed.
  static Future<void> show(
    BuildContext context, {
    required AssistantLiveCubit cubit,
    required String assistantName,
    required AssistantLiveCallActions Function(BuildContext route) actions,
    Future<void>? startAttempt,
  }) => Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      settings: const RouteSettings(name: routeName),
      builder: (route) => AssistantLiveCallScreen(
        cubit: cubit,
        assistantName: assistantName,
        actions: actions(route),
        startAttempt: startAttempt,
      ),
    ),
  );

  @override
  State<AssistantLiveCallScreen> createState() =>
      _AssistantLiveCallScreenState();
}

class _AssistantLiveCallScreenState extends State<AssistantLiveCallScreen> {
  StreamSubscription<AssistantLiveState>? _states;
  late bool _started = assistantLiveCallStarted(widget.cubit.state.status);

  @override
  void initState() {
    super.initState();
    // The owning page closes the cubit on teardown; never leave a call surface
    // over a session that no longer exists.
    if (widget.cubit.isClosed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _dismiss());
    } else {
      _states = widget.cubit.stream.listen(_observe, onDone: _dismiss);
    }
    // A start attempt that settles without ever starting the session (a
    // refused permission, a retired scope) leaves nothing to show.
    unawaited(
      widget.startAttempt?.whenComplete(() {
        if (!_started) _dismiss();
      }),
    );
  }

  void _observe(AssistantLiveState state) {
    if (!_started && assistantLiveCallStarted(state.status) && mounted) {
      setState(() => _started = true);
    }
  }

  void _dismiss() {
    if (mounted) unawaited(Navigator.of(context).maybePop());
  }

  @override
  void dispose() {
    unawaited(_states?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Material(
    type: MaterialType.transparency,
    child: BlocBuilder<AssistantLiveCubit, AssistantLiveState>(
      bloc: widget.cubit,
      builder: (context, state) => AssistantLiveCallView(
        state: state,
        assistantName: widget.assistantName,
        actions: widget.actions,
        awaitingStart: !_started,
      ),
    ),
  );
}
