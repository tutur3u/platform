import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantMessageReceiptStatus { delivered, read }

/// Optimistic IDs remain request IDs until the saved-user acknowledgement.
/// A following response is evidence of model processing, not human readership.
AssistantMessageReceiptStatus? assistantMessageReceiptStatus(
  List<AssistantMessage> messages,
  int index,
) {
  final message = messages[index];
  if (message.role != 'user' ||
      message.clientRequestId == null ||
      message.id == message.clientRequestId) {
    return null;
  }
  for (final next in messages.skip(index + 1)) {
    if (next.role == 'user') break;
    if (next.role == 'assistant' && next.parts.isNotEmpty) {
      return AssistantMessageReceiptStatus.read;
    }
  }
  return AssistantMessageReceiptStatus.delivered;
}

class AssistantMessageReceipt extends StatefulWidget {
  const AssistantMessageReceipt({
    required this.timestamp,
    required this.status,
    super.key,
  });

  final DateTime timestamp;
  final AssistantMessageReceiptStatus? status;

  @override
  State<AssistantMessageReceipt> createState() =>
      _AssistantMessageReceiptState();
}

class _AssistantMessageReceiptState extends State<AssistantMessageReceipt> {
  Timer? _timer;
  bool _showDelivered = false;

  @override
  void didUpdateWidget(covariant AssistantMessageReceipt oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != widget.status) {
      _timer?.cancel();
      _showDelivered =
          widget.status == AssistantMessageReceiptStatus.read &&
          oldWidget.status != AssistantMessageReceiptStatus.read;
      if (_showDelivered) {
        _timer = Timer(const Duration(milliseconds: 700), () {
          if (mounted) setState(() => _showDelivered = false);
        });
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = _showDelivered
        ? AssistantMessageReceiptStatus.delivered
        : widget.status;
    final label = switch (status) {
      AssistantMessageReceiptStatus.delivered =>
        context.l10n.assistantMessageDelivered,
      AssistantMessageReceiptStatus.read => context.l10n.assistantMessageRead,
      null => null,
    };
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(
        alignment: WrapAlignment.end,
        spacing: 6,
        children: [
          if (label != null)
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          Text(
            DateFormat('HH:mm').format(widget.timestamp.toLocal()),
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w300,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
