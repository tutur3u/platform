import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class AppVisibilityButton extends StatelessWidget {
  const AppVisibilityButton({
    required this.hidden,
    required this.onPressed,
    super.key,
  });

  final bool hidden;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: hidden ? context.l10n.appsShow : context.l10n.appsHide,
    visualDensity: VisualDensity.compact,
    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
    padding: EdgeInsets.zero,
    iconSize: 19,
    onPressed: onPressed,
    icon: Icon(
      hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
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
