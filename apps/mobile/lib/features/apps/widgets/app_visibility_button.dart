import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/l10n/l10n.dart';

class AppVisibilityButton extends StatelessWidget {
  const AppVisibilityButton({
    required this.hidden,
    required this.onPressed,
    this.cornerAligned = false,
    super.key,
  });

  final bool hidden;
  final VoidCallback onPressed;
  final bool cornerAligned;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: hidden ? context.l10n.appsShow : context.l10n.appsHide,
    visualDensity: VisualDensity.compact,
    constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
    padding: EdgeInsets.zero,
    alignment: cornerAligned ? Alignment.centerRight : Alignment.center,
    onPressed: () {
      unawaited(AppHaptics.selection());
      onPressed();
    },
    icon: Container(
      width: 27,
      height: 27,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        shape: BoxShape.circle,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Icon(
        hidden ? Icons.visibility_outlined : Icons.remove_rounded,
        size: 17,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

Future<bool> confirmHideApp(BuildContext context) async {
  return await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(context.l10n.appsHideConfirmTitle),
          content: Text(context.l10n.appsHideConfirmDescription),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(context.l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(context.l10n.appsHide),
            ),
          ],
        ),
      ) ??
      false;
}
