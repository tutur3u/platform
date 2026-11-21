import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The pill composer that floats above the dock. Text only, up to
/// [ThreadCubit.maxReplyLength] characters; the reply is steered into the
/// running turn or starts an idle thread.
class ThreadComposer extends StatefulWidget {
  const ThreadComposer({required this.onSend, super.key});

  /// Returns whether the text was taken; the field clears only then.
  final bool Function(String text) onSend;

  @override
  State<ThreadComposer> createState() => _ThreadComposerState();
}

class _ThreadComposerState extends State<ThreadComposer> {
  final _controller = TextEditingController();

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    if (widget.onSend(_controller.text)) _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final text = _controller.text.trim();
    final tooLong = text.length > ThreadCubit.maxReplyLength;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (tooLong)
          Padding(
            padding: const EdgeInsets.only(bottom: 4, left: 12),
            child: Text(
              l10n.mastermindProjectsReplyTooLong,
              style: TextStyle(color: colors.destructive, fontSize: 12),
            ),
          ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.card,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: colors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: AppComposerRow(
              minHeight: 38,
              field: AppTextField(
                key: const ValueKey('projects-composer-field'),
                controller: _controller,
                placeholder: l10n.mastermindProjectsReplyHint,
                borderless: true,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.newline,
                contextMenuBuilder: platformTextContextMenuBuilder(),
                selectionControls: platformTextSelectionControls(),
              ),
              trailing: [
                AppIconButton(
                  key: const ValueKey('projects-composer-send'),
                  icon: const Icon(LucideIcons.send),
                  tooltip: l10n.mastermindProjectsSend,
                  variant: AppButtonVariant.primary,
                  shape: AppButtonShape.circle,
                  onPressed: text.isEmpty || tooLong ? null : _send,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
