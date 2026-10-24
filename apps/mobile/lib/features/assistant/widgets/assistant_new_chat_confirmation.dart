import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantNewChatDecision { inspectHistory, createNew }

Future<AssistantNewChatDecision?> showAssistantNewChatConfirmation(
  BuildContext context,
) => showAppDialog<AssistantNewChatDecision>(
  context: context,
  requestFocus: false,
  builder: (dialogContext) => AppDialog(
    title: dialogContext.l10n.assistantNewChatConfirmationTitle,
    content: SingleChildScrollView(
      child: Text(dialogContext.l10n.assistantNewChatConfirmationDescription),
    ),
    actions: [
      AppButton.ghost(
        onPressed: () => Navigator.of(dialogContext).pop(),
        child: Text(dialogContext.l10n.commonCancel),
      ),
      AppButton.ghost(
        onPressed: () => Navigator.of(
          dialogContext,
        ).pop(AssistantNewChatDecision.inspectHistory),
        child: Text(dialogContext.l10n.assistantNewChatInspectHistory),
      ),
      AppButton.primary(
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
    await showAppDialog<bool>(
      context: context,
      requestFocus: false,
      builder: (dialogContext) => AppDialog(
        title: dialogContext.l10n.assistantNewChatConfirmationTitle,
        content: SingleChildScrollView(child: Text(message)),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonDone),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.assistantNewChatInspectHistory),
          ),
        ],
      ),
    ) ??
    false;
