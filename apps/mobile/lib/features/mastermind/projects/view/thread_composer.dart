import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// The pill composer that floats above the dock. Text only, up to
/// [fleetReplyMaxChars] characters; the reply is steered into the running
/// turn or starts an idle thread. The page owns [controller], so the text
/// stays for a resend under the same key until a reply is taken.
class ThreadComposer extends StatefulWidget {
  const ThreadComposer({
    required this.controller,
    required this.onSend,
    this.enabled = true,
    super.key,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSend;

  /// False while a reply is being sent or held for the machine.
  final bool enabled;

  @override
  State<ThreadComposer> createState() => _ThreadComposerState();
}

class _ThreadComposerState extends State<ThreadComposer> {
  TextEditingController get _controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_changed);
  }

  @override
  void didUpdateWidget(covariant ThreadComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() => setState(() {});

  void _send() => widget.onSend(_controller.text);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final text = _controller.text.trim();
    final tooLong = text.length > fleetReplyMaxChars;
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
                  onPressed: !widget.enabled || text.isEmpty || tooLong
                      ? null
                      : _send,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
