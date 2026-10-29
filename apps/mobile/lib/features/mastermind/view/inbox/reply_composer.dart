import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/l10n/l10n.dart';

/// Caps input at [limit] code points, the unit the hub counts.
class CodePointLimitFormatter extends TextInputFormatter {
  const CodePointLimitFormatter(this.limit);

  final int limit;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.runes.length <= limit) return newValue;
    final kept = String.fromCharCodes(newValue.text.runes.take(limit));
    return TextEditingValue(
      text: kept,
      selection: TextSelection.collapsed(offset: kept.length),
    );
  }
}

/// Caps input at [limit] lines, as the hub does. Text typed or pasted at the
/// end loses its surplus lines; an edit that would push the last line out of
/// the field from the middle is refused rather than silently eating words.
class LineLimitFormatter extends TextInputFormatter {
  const LineLimitFormatter(this.limit);

  final int limit;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final lines = newValue.text.split(RegExp(r'\r\n|\n|\r'));
    if (lines.length <= limit) return newValue;
    if (newValue.selection.end != newValue.text.length) return oldValue;
    final kept = lines.take(limit).join('\n');
    return TextEditingValue(
      text: kept,
      selection: TextSelection.collapsed(offset: kept.length),
    );
  }
}

/// One tap on an option starts a short undo window ("Sending · Undo", see
/// [MastermindRepliesCubit.queueOption]) and then queues the reply into the
/// outbox. Free text remains a saved draft and still asks to confirm.
class ReplyComposer extends StatefulWidget {
  const ReplyComposer({required this.item, required this.replies, super.key});

  final NeedsYou item;
  final MastermindRepliesCubit replies;

  @override
  State<ReplyComposer> createState() => _ReplyComposerState();
}

class _ReplyComposerState extends State<ReplyComposer> {
  final _text = TextEditingController();

  @override
  void initState() {
    super.initState();
    final draft = widget.replies.draftFor(widget.item.id);
    _text.text = draft.text;
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _save() =>
      widget.replies.saveDraft(widget.item.id, ReplyDraft(text: _text.text));
  void _typed(String value) => setState(_save);
  bool get _canSend => isValidReplyText(_text.text);

  void _sendOption(int index) =>
      widget.replies.queueOption(item: widget.item, optionIndex: index);

  Future<void> _send() async {
    final l10n = context.l10n;
    final item = widget.item;
    final text = _text.text.trim();
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
    if (!confirmed || !mounted) return;
    await widget.replies.submit(item: item, text: text);
  }

  @override
  Widget build(BuildContext context) {
    final options = selectableOptions(widget.item);
    return BlocSelector<
      MastermindRepliesCubit,
      MastermindRepliesState,
      PendingOptionReply?
    >(
      bloc: widget.replies,
      selector: (state) =>
          state.pendingOptionFor(widget.item.id, widget.item.versionHash),
      builder: (context, pending) => _form(context, options, pending),
    );
  }

  Widget _form(
    BuildContext context,
    List<(int, String)> options,
    PendingOptionReply? pending,
  ) {
    final l10n = context.l10n;
    final item = widget.item;
    final choosing = pending != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (pending != null && !pending.committed)
          ReplyUndoBar(
            option: pending.option,
            onUndo: () => widget.replies.undoOption(item.id),
          ),
        if (options.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindReplyOptionsTitle,
            children: [
              for (final (index, option) in options)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  child: AppButton.outline(
                    onPressed: choosing ? null : () => _sendOption(index),
                    child: Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      alignment: WrapAlignment.center,
                      children: [
                        Text(option),
                        if (item.optionRecommended(index))
                          AppBadge(child: Text(l10n.mastermindRecommended)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        AppTextField(
          controller: _text,
          placeholder: l10n.mastermindReplyTextPlaceholder,
          helperText: l10n.mastermindReplyChooseOrWrite,
          minLines: 2,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
          inputFormatters: const [
            LineLimitFormatter(mastermindReplyLineLimit),
            CodePointLimitFormatter(mastermindReplyTextLimit),
          ],
          onChanged: _typed,
        ),
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Align(
            alignment: AlignmentDirectional.centerEnd,
            child: Semantics(
              label: l10n.mastermindReplyCounterSemantics(
                _text.text.runes.length,
                mastermindReplyTextLimit,
              ),
              excludeSemantics: true,
              child: Text(
                l10n.mastermindReplyCounter(
                  _text.text.runes.length,
                  mastermindReplyTextLimit,
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton.primary(
          onPressed: !choosing && _canSend ? () => unawaited(_send()) : null,
          child: Text(l10n.mastermindReplySend),
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}
