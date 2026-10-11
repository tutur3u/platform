import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/profile/view/profile_picker_intent.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> confirmRemoveProfileAvatar(BuildContext context) async {
  final intent = ProfilePickerIntent.capture(context);
  if (intent == null) return;
  try {
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (dialogContext) => AppDialogScaffold(
        title: dialogContext.l10n.profileRemoveAvatar,
        description: dialogContext.l10n.profileRemoveAvatarDescription,
        icon: Icons.delete_outline_rounded,
        maxWidth: 420,
        maxHeightFactor: 0.56,
        scrollHeader: true,
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.profileCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.profileRemoveAvatar),
          ),
        ],
        child: const SizedBox.shrink(),
      ),
    );

    if (confirmed != true || !context.mounted || !intent.current(context)) {
      return;
    }

    final success = await intent.cubit.removeAvatar();
    if (!context.mounted || !intent.current(context)) {
      return;
    }

    shad.showToast(
      context: context,
      builder: (toastContext, _) => success
          ? shad.Alert(
              title: Text(toastContext.l10n.profileAvatarRemoveSuccess),
            )
          : shad.Alert.destructive(
              title: Text(toastContext.l10n.profileAvatarRemoveError),
            ),
    );
  } finally {
    await intent.dispose();
  }
}
