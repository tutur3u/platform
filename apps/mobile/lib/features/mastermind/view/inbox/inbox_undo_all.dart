import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';

/// The Inbox's Undo-all bar: every reply still inside its undo window, from
/// the same held-entries rule the cubit's `undoAll` cancels. Needs a
/// [MastermindRepliesWatcher] above it.
class InboxUndoAll extends StatelessWidget {
  const InboxUndoAll({super.key});

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      builder: (context, state) {
        final now = replies.now();
        return MastermindUndoAllBar(
          count: state.heldEntries(now).length,
          expiresAt: state.earliestHoldUntil(now),
          now: replies.now,
          onUndoAll: replies.undoAll,
        );
      },
    );
  }
}
