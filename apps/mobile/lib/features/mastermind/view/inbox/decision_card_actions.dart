import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/option_labels.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_status_panel.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/l10n/l10n.dart';

/// Inline choices share the detail composer's version-bound outbox and timers.
/// Choosing hides the choices immediately; only a hub snapshot resolves an ask.
class DecisionCardActions extends StatelessWidget {
  const DecisionCardActions({required this.item, super.key});

  final NeedsYou item;

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      builder: (context, state) {
        final l10n = context.l10n;
        final entry = state.entryFor(item.id, item.versionHash);
        final pending = state.pendingOptionFor(item.id, item.versionHash);
        if (pending != null) {
          return ReplyUndoBar(
            option: plainOptionLabel(item, pending.optionIndex),
            onUndo: pending.committed
                ? null
                : () => replies.undoOption(item.id),
          );
        }
        if (entry != null) {
          return ReplyEntryPanel(
            entry: entry,
            status: state.statusFor(item.id),
            replies: replies,
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ReplyIssueBanner(issue: state.statusFor(item.id).issue),
            // The recommended option is filled and carries the word, so the
            // mark never rests on colour alone; the publisher's order stays.
            for (final (index, _) in selectableOptions(item))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: _OptionButton(
                  key: ValueKey('decision-option-${item.id}-$index'),
                  recommended: item.optionRecommended(index),
                  onPressed: state.canReply
                      ? () =>
                            replies.queueOption(item: item, optionIndex: index)
                      : null,
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      Text(plainOptionLabel(item, index)),
                      if (item.optionRecommended(index))
                        AppBadge(child: Text(l10n.mastermindRecommended)),
                    ],
                  ),
                ),
              ),
            if (!state.canReply)
              Text(switch (state.capability) {
                ReplyCapability.unknown ||
                ReplyCapability.checking => l10n.mastermindReplyChecking,
                ReplyCapability.unavailable => l10n.mastermindReplyCheckFailed,
                _ => l10n.mastermindReplyOnMac,
              }),
          ],
        );
      },
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.recommended,
    required this.onPressed,
    required this.child,
    super.key,
  });

  final bool recommended;
  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) => recommended
      ? AppButton.secondary(
          size: AppButtonSize.large,
          onPressed: onPressed,
          child: child,
        )
      : AppButton.outline(
          size: AppButtonSize.large,
          onPressed: onPressed,
          child: child,
        );
}
