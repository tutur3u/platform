import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestReasonBox extends StatelessWidget {
  const RequestReasonBox({
    required this.text,
    required this.color,
    super.key,
  });

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: theme.typography.small.copyWith(color: color),
      ),
    );
  }
}

class RequestManagerActionsBar extends StatelessWidget {
  const RequestManagerActionsBar({
    required this.onApprove,
    required this.onReject,
    required this.onRequestInfo,
    super.key,
  });

  final VoidCallback onApprove;
  final ValueChanged<String?> onReject;
  final ValueChanged<String?> onRequestInfo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const shad.Divider(),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: () {
                          onApprove();
                          Navigator.of(context).pop();
                        },
                        child: Text(l10n.timerApprove),
                      ),
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: shad.DestructiveButton(
                        onPressed: () => _showReasonDialog(
                          context,
                          title: l10n.timerReject,
                          onSubmit: onReject,
                        ),
                        child: Text(l10n.timerReject),
                      ),
                    ),
                  ],
                ),
                const shad.Gap(8),
                shad.OutlineButton(
                  onPressed: () => _showReasonDialog(
                    context,
                    title: l10n.timerRequestInfo,
                    onSubmit: onRequestInfo,
                  ),
                  child: Text(l10n.timerRequestInfo),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showReasonDialog(
    BuildContext context, {
    required String title,
    required ValueChanged<String?> onSubmit,
  }) {
    final controller = TextEditingController();
    unawaited(
      shad.showDialog<void>(
        context: context,
        builder: (dialogCtx) => shad.AlertDialog(
          barrierColor: Colors.transparent,
          title: Text(title),
          content: shad.TextField(
            controller: controller,
            maxLines: 3,
            placeholder: Text(context.l10n.timerReasonOptional),
          ),
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: Text(context.l10n.profileCancel),
            ),
            shad.PrimaryButton(
              onPressed: () {
                final reason = controller.text.trim();
                onSubmit(reason.isEmpty ? null : reason);
                Navigator.of(dialogCtx).pop();
                if (!context.mounted) {
                  return;
                }
                Navigator.of(context).pop();
              },
              child: Text(title),
            ),
          ],
        ),
      ),
    );
  }
}
