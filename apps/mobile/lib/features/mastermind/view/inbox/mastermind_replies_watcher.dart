import 'dart:async';

import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// Keeps the reply path warm while an Inbox screen is mounted: asks the hub
/// whether replies are on, and sends anything queued on the device, when the
/// screen opens and every time the app comes back to the foreground.
///
/// It also announces "Already answered on Mac" when an ask is answered
/// elsewhere while this device's one-tap reply to it was still undoable: that
/// reply is cancelled silently, so the announcement is the only signal.
class MastermindRepliesWatcher extends StatefulWidget {
  const MastermindRepliesWatcher({required this.child, super.key});

  final Widget child;

  static MastermindRepliesCubit cubitOf(BuildContext context) =>
      context.read<MastermindRuntime>().replies;

  static MastermindAnsweredElsewhereCubit answeredOf(BuildContext context) =>
      context.read<MastermindRuntime>().answered;

  @override
  State<MastermindRepliesWatcher> createState() =>
      _MastermindRepliesWatcherState();
}

class _MastermindRepliesWatcherState extends State<MastermindRepliesWatcher>
    with WidgetsBindingObserver {
  late final MastermindRepliesCubit _replies = MastermindRepliesWatcher.cubitOf(
    context,
  );
  final _announced = <String>{};

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
    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(_replies.flushOnBackground());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _announce(Map<String, AnsweredElsewhere> lingering) {
    _announced.removeWhere((id) => !lingering.containsKey(id));
    for (final MapEntry(key: id, value: entry) in lingering.entries) {
      if (!entry.cancelledReply || !_announced.add(id)) continue;
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          alreadyAnsweredText(context.l10n, entry.via),
          Directionality.of(context),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) =>
      BlocListener<
        MastermindAnsweredElsewhereCubit,
        Map<String, AnsweredElsewhere>
      >(
        bloc: MastermindRepliesWatcher.answeredOf(context),
        listener: (context, state) => _announce(state),
        child: widget.child,
      );
}
