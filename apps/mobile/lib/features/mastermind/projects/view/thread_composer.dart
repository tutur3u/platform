import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_attachment.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// The thread composer accepts text up to
/// [fleetReplyMaxChars] characters; the reply is steered into the running
/// turn or starts an idle thread. The page owns [controller], so the text
/// stays for a resend under the same key until a reply is taken.
class ThreadComposer extends StatefulWidget {
  const ThreadComposer({
    required this.controller,
    required this.onSend,
    this.enabled = true,
    this.attachments = const [],
    this.onPick,
    this.onRemove,
    super.key,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSend;
  final List<FleetReplyAttachment> attachments;
  final VoidCallback? onPick;
  final ValueChanged<FleetReplyAttachment>? onRemove;

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
        if (widget.attachments.isNotEmpty)
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final file in widget.attachments)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: Material(
                      type: MaterialType.transparency,
                      child: InputChip(
                        avatar: file.kind == FleetReplyAttachmentKind.image
                            ? Image.memory(
                                file.bytes,
                                cacheWidth: 48,
                                cacheHeight: 48,
                                width: 24,
                                height: 24,
                                excludeFromSemantics: true,
                                errorBuilder: (_, _, _) =>
                                    const Icon(LucideIcons.image),
                              )
                            : const Icon(LucideIcons.file),
                        label: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 140),
                          child: Text(
                            file.name,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        onDeleted: widget.enabled
                            ? () => widget.onRemove?.call(file)
                            : null,
                        deleteButtonTooltipMessage:
                            l10n.mastermindTranscriptRemoveAttachment,
                      ),
                    ),
                  ),
              ],
            ),
          ),
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
                readOnly: !widget.enabled,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.newline,
                contextMenuBuilder: platformTextContextMenuBuilder(),
                selectionControls: platformTextSelectionControls(),
              ),
              trailing: [
                if (widget.onPick case final pick?)
                  AppIconButton(
                    icon: const Icon(LucideIcons.paperclip),
                    tooltip: l10n.assistantAttachFilesAction,
                    onPressed: widget.enabled ? pick : null,
                  ),
                AppIconButton(
                  key: const ValueKey('projects-composer-send'),
                  icon: const Icon(LucideIcons.send),
                  tooltip: l10n.mastermindProjectsSend,
                  variant: AppButtonVariant.primary,
                  shape: AppButtonShape.circle,
                  onPressed:
                      !widget.enabled ||
                          (text.isEmpty && widget.attachments.isEmpty) ||
                          tooLong
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
