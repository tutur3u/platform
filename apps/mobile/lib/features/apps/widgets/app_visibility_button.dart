import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class AppVisibilityButton extends StatelessWidget {
  const AppVisibilityButton({
    required this.hidden,
    required this.onPressed,
    this.cornerAligned = false,
    super.key,
  });

  final bool hidden;
  final VoidCallback? onPressed;
  final bool cornerAligned;

  @override
  Widget build(BuildContext context) => Align(
    alignment: cornerAligned ? Alignment.centerRight : Alignment.center,
    widthFactor: 1,
    heightFactor: 1,
    child: AppIconButton(
      tooltip: onPressed == null
          ? context.l10n.appsUnavailableWithCurrentAccess
          : hidden
          ? context.l10n.appsShow
          : context.l10n.appsHide,
      icon: Icon(hidden ? LucideIcons.eye : LucideIcons.minus),
      variant: AppButtonVariant.secondary,
      shape: AppButtonShape.circle,
      onPressed: onPressed == null
          ? null
          : () {
              unawaited(AppHaptics.selection());
              onPressed!();
            },
    ),
  );
}

Future<bool> confirmHideApp(BuildContext context) async {
  return await showAppDialog<bool>(
        context: context,
        builder: (dialogContext) => AppDialog(
          title: context.l10n.appsHideConfirmTitle,
          content: Text(context.l10n.appsHideConfirmDescription),
          actions: [
            AppButton.ghost(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(context.l10n.commonCancel),
            ),
            AppButton.primary(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(context.l10n.appsHide),
            ),
          ],
        ),
      ) ??
      false;
}
