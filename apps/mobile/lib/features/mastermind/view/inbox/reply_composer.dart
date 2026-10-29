import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_disclosure.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/option_labels.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_choice.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_limit_formatters.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/features/mastermind/view/inbox/reply_limit_formatters.dart';

/// The body half of the reply: the options as full-width rows on one surface,
/// and "Write your own" collapsed below them. Choosing only selects; the
/// sticky [ReplyActionBar] sends. An option still gets the short undo window
/// ([MastermindRepliesCubit.queueOption]); free text still asks to confirm.
class ReplyComposer extends StatelessWidget {
  const ReplyComposer({
    required this.item,
    required this.replies,
    required this.choice,
    super.key,
  });

  final NeedsYou item;
  final MastermindRepliesCubit replies;
  final ReplyChoice choice;

  @override
  Widget build(BuildContext context) =>
      BlocSelector<
        MastermindRepliesCubit,
        MastermindRepliesState,
        PendingOptionReply?
      >(
        bloc: replies,
        selector: (state) => state.pendingOptionFor(item.id, item.versionHash),
        builder: (context, pending) => ListenableBuilder(
          listenable: choice,
          builder: (context, _) => _form(context, pending),
        ),
      );

  Widget _form(BuildContext context, PendingOptionReply? pending) {
    final l10n = context.l10n;
    final options = recommendedFirst(item, selectableOptions(item));
    final locked = pending != null;
    final writer = _WriteYourOwn(
      choice: choice,
      // With nothing to pick, writing is the only way to answer.
      initiallyExpanded: options.isEmpty || choice.text.text.isNotEmpty,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (pending != null && !pending.committed)
          ReplyUndoBar(
            option: plainOptionLabel(item, pending.optionIndex),
            onUndo: () => replies.undoOption(item.id),
          ),
        MastermindGroup(
          caption: l10n.mastermindReplyOptionsTitle,
          dividerInset: AppLayout.rowHorizontalPadding,
          children: [
            for (final (index, label) in options)
              MastermindOptionRow(
                key: ValueKey('mastermind-option-$index'),
                label: label,
                recommended: item.optionRecommended(index),
                selected: (pending?.optionIndex ?? choice.selected) == index,
                onTap: locked ? null : () => choice.select(index),
              ),
            writer,
          ],
        ),
      ],
    );
  }
}

class _WriteYourOwn extends StatelessWidget {
  const _WriteYourOwn({required this.choice, required this.initiallyExpanded});

  final ReplyChoice choice;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final count = choice.text.text.runes.length;
    return AppDisclosure(
      key: const ValueKey('mastermind-write-own'),
      initiallyExpanded: initiallyExpanded,
      leading: Icon(
        LucideIcons.pencilLine,
        size: 20,
        color: tokens.colorScheme.mutedForeground,
      ),
      title: Text(l10n.mastermindReplyWriteOwn),
      childrenPadding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        0,
        AppSpacing.md,
        AppSpacing.md,
      ),
      children: [
        AppTextField(
          controller: choice.text,
          placeholder: l10n.mastermindReplyTextPlaceholder,
          borderless: true,
          minLines: 2,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
          inputFormatters: const [
            LineLimitFormatter(mastermindReplyLineLimit),
            CodePointLimitFormatter(mastermindReplyTextLimit),
          ],
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: Semantics(
            label: l10n.mastermindReplyCounterSemantics(
              count,
              mastermindReplyTextLimit,
            ),
            excludeSemantics: true,
            child: Text(
              l10n.mastermindReplyCounter(count, mastermindReplyTextLimit),
              style: tokens.typography.xSmall.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The sticky primary action: "Send “<option>”" for a chosen option, "Send
/// reply" for written words, disabled until there is something to send.
/// Hidden while an option's undo window runs or once a reply is on its way;
/// the body shows those states.
class ReplyActionBar extends StatelessWidget {
  const ReplyActionBar({
    required this.item,
    required this.replies,
    required this.choice,
    super.key,
  });

  final NeedsYou item;
  final MastermindRepliesCubit replies;
  final ReplyChoice choice;

  Future<void> _send(BuildContext context) async {
    final selected = choice.selected;
    if (selected != null) {
      if (replies.queueOption(item: item, optionIndex: selected)) {
        choice.clearSelection();
      }
      return;
    }
    final l10n = context.l10n;
    final text = choice.text.text.trim();
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.mastermindReplyConfirmTitle,
      message: l10n.mastermindReplyConfirmMessage(
        itemDisplayTitle(l10n, item),
        text,
      ),
      confirmLabel: l10n.mastermindReplySend,
      cancelLabel: l10n.commonCancel,
    );
    if (!confirmed || !context.mounted) return;
    await replies.submit(item: item, text: text);
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
        bloc: replies,
        builder: (context, state) {
          final busy =
              state.pendingOptionFor(item.id, item.versionHash) != null ||
              state.entryFor(item.id, item.versionHash) != null;
          if (!state.canReply || busy) return const SizedBox.shrink();
          return ListenableBuilder(
            listenable: choice,
            builder: (context, _) {
              final l10n = context.l10n;
              final selected = choice.selected;
              return AppButton.primary(
                size: AppButtonSize.large,
                onPressed: choice.ready
                    ? () => unawaited(_send(context))
                    : null,
                child: Text(
                  selected == null
                      ? l10n.mastermindReplySend
                      : l10n.mastermindReplySendOption(
                          plainOptionLabel(item, selected),
                        ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              );
            },
          );
        },
      );
}
