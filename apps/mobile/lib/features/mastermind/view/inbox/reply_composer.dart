import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
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

/// Option tiles and a free-text reply for one open question.
///
/// A reply is one thing or the other, as the hub's contract says: picking an
/// option clears the text, typing clears the option. What is composed is kept
/// in the replies cubit, so it survives the question being refreshed under it
/// (a 409) and the page being rebuilt.
class ReplyComposer extends StatefulWidget {
  const ReplyComposer({required this.item, required this.replies, super.key});

  final NeedsYou item;
  final MastermindRepliesCubit replies;

  @override
  State<ReplyComposer> createState() => _ReplyComposerState();
}

class _ReplyComposerState extends State<ReplyComposer> {
  final _text = TextEditingController();
  int? _option;

  @override
  void initState() {
    super.initState();
    final draft = widget.replies.draftFor(widget.item.id);
    _text.text = draft.text;
    _option = _stillValid(widget.item, draft.optionIndex, draft.optionLabel)
        ? draft.optionIndex
        : null;
  }

  @override
  void didUpdateWidget(covariant ReplyComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.versionHash == widget.item.versionHash) return;
    // The question changed: keep the words, keep the option only if it is
    // still the same option at the same place.
    final label = _option == null ? null : oldWidget.item.options[_option!];
    if (!_stillValid(widget.item, _option, label)) _option = null;
    _save();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  static bool _stillValid(NeedsYou item, int? index, String? label) =>
      index != null &&
      index < item.options.length &&
      item.options[index] == label &&
      label != mastermindReplyPlaceholderOption;

  void _save() => widget.replies.saveDraft(
    widget.item.id,
    ReplyDraft(
      optionIndex: _option,
      optionLabel: _option == null ? null : widget.item.options[_option!],
      text: _text.text,
    ),
  );

  void _pick(int index) => setState(() {
    _option = index;
    _text.clear();
    _save();
  });

  void _typed(String value) => setState(() {
    if (value.isNotEmpty) _option = null;
    _save();
  });

  bool get _canSend => _option != null || isValidReplyText(_text.text);

  Future<void> _send() async {
    final l10n = context.l10n;
    final item = widget.item;
    final index = _option;
    final text = _text.text.trim();
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.mastermindReplyConfirmTitle,
      message: l10n.mastermindReplyConfirmMessage(
        item.title,
        index == null ? text : item.options[index],
      ),
      confirmLabel: l10n.mastermindReplySend,
      cancelLabel: l10n.commonCancel,
    );
    if (!confirmed || !mounted) return;
    await widget.replies.submit(
      item: item,
      optionIndex: index,
      text: index == null ? text : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final item = widget.item;
    final options = selectableOptions(item);
    final recommended = options
        .where((entry) => entry.$2 == item.recommendedOption)
        .firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (options.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindReplyOptionsTitle,
            children: [
              for (final (index, option) in options)
                AppOptionTile(
                  title: option,
                  subtitle: option == item.recommendedOption
                      ? l10n.mastermindRecommended
                      : null,
                  leading: option == item.recommendedOption
                      ? const Icon(LucideIcons.star)
                      : null,
                  selected: _option == index,
                  onTap: () => _pick(index),
                ),
            ],
          ),
        if (recommended != null && _option != recommended.$1)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppButton.ghost(
              onPressed: () => _pick(recommended.$1),
              child: Text(l10n.mastermindReplyUseRecommended),
            ),
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
          onPressed: _canSend ? () => unawaited(_send()) : null,
          child: Text(l10n.mastermindReplySend),
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}
