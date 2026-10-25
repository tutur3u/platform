import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Confirms a voice start that arrived from an entry other apps can invoke
/// (Android App Actions). The microphone stays off until the user agrees.
Future<bool> showAssistantLaunchVoiceConfirmation(
  BuildContext context, {
  required String assistantName,
}) async =>
    await showAppDialog<bool>(
      context: context,
      requestFocus: false,
      builder: (dialogContext) => AppDialog(
        title: dialogContext.l10n.assistantLaunchVoiceConfirmTitle(
          assistantName,
        ),
        content: SingleChildScrollView(
          child: Text(
            dialogContext.l10n.assistantLaunchVoiceConfirmDescription,
          ),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.assistantLaunchVoiceConfirmStart),
          ),
        ],
      ),
    ) ??
    false;
