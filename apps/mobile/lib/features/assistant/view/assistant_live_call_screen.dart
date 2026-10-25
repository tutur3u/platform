import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart';

export 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart'
    show AssistantLiveCallActions;

/// Full-screen Live call, pushed on the root navigator above the app shell.
/// Popping (Minimize or system Back) keeps the call running; the in-shell Live
/// view then offers Return to call.
class AssistantLiveCallScreen extends StatefulWidget {
  const AssistantLiveCallScreen({
    required this.cubit,
    required this.assistantName,
    required this.actions,
    super.key,
  });

  static const routeName = 'assistant-live-call';

  final AssistantLiveCubit cubit;
  final String assistantName;
  final AssistantLiveCallActions actions;

  /// Opens the call above the shell; completes when the surface is dismissed.
  static Future<void> show(
    BuildContext context, {
    required AssistantLiveCubit cubit,
    required String assistantName,
    required AssistantLiveCallActions Function(BuildContext route) actions,
  }) => Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      settings: const RouteSettings(name: routeName),
      builder: (route) => AssistantLiveCallScreen(
        cubit: cubit,
        assistantName: assistantName,
        actions: actions(route),
      ),
    ),
  );

  @override
  State<AssistantLiveCallScreen> createState() =>
      _AssistantLiveCallScreenState();
}

class _AssistantLiveCallScreenState extends State<AssistantLiveCallScreen> {
  StreamSubscription<AssistantLiveState>? _closed;

  @override
  void initState() {
    super.initState();
    // The owning page closes the cubit on teardown or scope change; never
    // leave a call surface over a session that no longer exists.
    if (widget.cubit.isClosed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _dismiss());
    } else {
      _closed = widget.cubit.stream.listen(null, onDone: _dismiss);
    }
  }

  void _dismiss() {
    if (mounted) unawaited(Navigator.of(context).maybePop());
  }

  @override
  void dispose() {
    unawaited(_closed?.cancel());
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
      ),
    ),
  );
}
