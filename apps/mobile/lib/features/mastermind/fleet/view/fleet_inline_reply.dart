import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// A one-line answer box with a send button under a card. Sending hands the
/// trimmed text to [onSend], clears the box and lets the Inbox move on to
/// the next card. [focusNode] lets the Inbox focus it after the previous
/// card was answered.
class FleetInlineReply extends StatefulWidget {
  const FleetInlineReply({
    required this.onSend,
    this.placeholder,
    this.focusNode,
    this.enabled = true,
    this.autofocus = false,
    super.key,
  });

  final ValueChanged<String> onSend;

  /// "Reply…" without it.
  final String? placeholder;
  final FocusNode? focusNode;
  final bool enabled;
  final bool autofocus;

  /// Web's cap on reply text.
  static const maxLength = 2000;

  @override
  State<FleetInlineReply> createState() => _FleetInlineReplyState();
}

class _FleetInlineReplyState extends State<FleetInlineReply> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty || !widget.enabled) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(
          child: AppTextField(
            controller: _controller,
            focusNode: widget.focusNode,
            autofocus: widget.autofocus,
            enabled: widget.enabled,
            placeholder:
                widget.placeholder ??
                l10n.mastermindFleetInlineReplyPlaceholder,
            textInputAction: TextInputAction.send,
            inputFormatters: [
              LengthLimitingTextInputFormatter(FleetInlineReply.maxLength),
            ],
            onSubmitted: (_) => _send(),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _controller,
          builder: (context, value, _) => AppIconButton(
            icon: const Icon(LucideIcons.send),
            tooltip: l10n.mastermindFleetSendAndNext,
            variant: AppButtonVariant.primary,
            shape: AppButtonShape.circle,
            onPressed: widget.enabled && value.text.trim().isNotEmpty
                ? _send
                : null,
          ),
        ),
      ],
    );
  }
}
