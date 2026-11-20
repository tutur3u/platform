import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Asks for a free-text answer to [question]; null when dismissed. Opens on
/// the root navigator so the floating dock never covers it.
Future<String?> showFleetReplySheet(
  BuildContext context, {
  required String orchestrator,
  required String question,
}) => showAppSheet<String>(
  context: context,
  useRootNavigator: true,
  builder: (context) =>
      _FleetReplySheet(orchestrator: orchestrator, question: question),
);

class _FleetReplySheet extends StatefulWidget {
  const _FleetReplySheet({required this.orchestrator, required this.question});

  final String orchestrator;
  final String question;

  @override
  State<_FleetReplySheet> createState() => _FleetReplySheetState();
}

class _FleetReplySheetState extends State<_FleetReplySheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isNotEmpty) Navigator.of(context).pop(text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.mastermindFleetReplyTitle(widget.orchestrator),
      description: widget.question,
      icon: LucideIcons.messageSquare,
      actions: [
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _controller,
          builder: (context, value, _) => AppButton.primary(
            enabled: value.text.trim().isNotEmpty,
            leading: const Icon(LucideIcons.send, size: 16),
            onPressed: _send,
            child: Text(l10n.mastermindFleetReplySend),
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: AppTextField(
          controller: _controller,
          placeholder: l10n.mastermindFleetReplyPlaceholder,
          autofocus: true,
          minLines: 3,
          maxLines: 8,
          maxLength: 2000,
          textInputAction: TextInputAction.newline,
          keyboardType: TextInputType.multiline,
        ),
      ),
    );
  }
}
