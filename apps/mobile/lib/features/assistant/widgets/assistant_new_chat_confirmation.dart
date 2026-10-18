import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantNewChatDecision { inspectHistory, createNew }

Future<AssistantNewChatDecision?> showAssistantNewChatConfirmation(
  BuildContext context,
) => showDialog<AssistantNewChatDecision>(
  context: context,
  requestFocus: false,
  builder: (dialogContext) => AlertDialog(
    title: Text(dialogContext.l10n.assistantNewChatConfirmationTitle),
    content: SingleChildScrollView(
      child: Text(dialogContext.l10n.assistantNewChatConfirmationDescription),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(dialogContext).pop(),
        child: Text(dialogContext.l10n.commonCancel),
      ),
      TextButton(
        onPressed: () => Navigator.of(
          dialogContext,
        ).pop(AssistantNewChatDecision.inspectHistory),
        child: Text(dialogContext.l10n.assistantNewChatInspectHistory),
      ),
      FilledButton(
        onPressed: () =>
            Navigator.of(dialogContext).pop(AssistantNewChatDecision.createNew),
        child: Text(dialogContext.l10n.assistantNewChatConfirmCreation),
      ),
    ],
  ),
);

Future<bool> showAssistantNewChatResetStatus(
  BuildContext context, {
  required String message,
}) async =>
    await showDialog<bool>(
      context: context,
      requestFocus: false,
      builder: (dialogContext) => AlertDialog(
        title: Text(dialogContext.l10n.assistantNewChatConfirmationTitle),
        content: SingleChildScrollView(child: Text(message)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonDone),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.assistantNewChatInspectHistory),
          ),
        ],
      ),
    ) ??
    false;
