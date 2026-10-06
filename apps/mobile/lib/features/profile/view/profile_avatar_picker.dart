import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/profile/view/profile_media_failure_message.dart';
import 'package:mobile/features/profile/view/profile_picker_intent.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Native chooser boundary; tests defer the same stages as platform dialogs.
class ProfileAvatarPicker {
  const ProfileAvatarPicker();

  Future<ImageSource?> chooseSource(BuildContext context) {
    final l10n = context.l10n;
    return showImageSourcePickerDialog(
      context: context,
      title: l10n.selectImageSource,
      description: l10n.profileAvatarPickerDescription,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );
  }

  Future<File?> pickImage(ImageSource source) async {
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    return file == null ? null : File(file.path);
  }

  Future<File?> cropImage(BuildContext context, File file) async {
    final theme = shad.Theme.of(context);
    final title = context.l10n.profileAvatar;
    final cropped = await ImageCropper().cropImage(
      sourcePath: file.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: title,
          toolbarColor: theme.colorScheme.primary,
          toolbarWidgetColor: theme.colorScheme.primaryForeground,
          initAspectRatio: CropAspectRatioPreset.square,
          lockAspectRatio: true,
        ),
        IOSUiSettings(
          title: title,
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
        ),
      ],
    );
    return cropped == null ? null : File(cropped.path);
  }
}

Future<void> pickAndUploadProfileAvatar(
  BuildContext context, {
  ProfileAvatarPicker picker = const ProfileAvatarPicker(),
}) async {
  final intent = ProfilePickerIntent.capture(context);
  if (intent == null) return;
  final cubit = intent.cubit..clearMediaFailure();
  bool current() => intent.current(context);
  try {
    final source = await picker.chooseSource(context);
    if (!current() || source == null) return;
    final picked = await picker.pickImage(source);
    if (!context.mounted || !current() || picked == null) return;
    final cropped = await picker.cropImage(context, picked);
    if (!current() || cropped == null) return;
    final success = await cubit.uploadAvatar(cropped);
    if (!context.mounted || !current()) return;
    shad.showToast(
      context: context,
      builder: (toastContext, _) => success
          ? shad.Alert(
              title: Text(toastContext.l10n.profileAvatarUpdateSuccess),
            )
          : shad.Alert.destructive(
              title: Text(
                profileMediaFailureMessage(
                  toastContext.l10n,
                  cubit.state.mediaFailure,
                  fallback: toastContext.l10n.profileAvatarUpdateError,
                ),
              ),
            ),
    );
  } finally {
    await intent.dispose();
  }
}
