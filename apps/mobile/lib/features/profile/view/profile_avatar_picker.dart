import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
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
  final auth = context.read<AuthCubit>();
  final cubit = context.read<ProfileCubit>();
  final actor = auth.state.user?.id;
  if (actor == null || cubit.state.profile?.id != actor) return;
  // An identity departure permanently invalidates this intent, including ABA.
  var departed = false;
  final subscription = auth.stream.listen((state) {
    if (state.user?.id != actor) departed = true;
  });
  bool current() =>
      context.mounted &&
      !departed &&
      !auth.isClosed &&
      !cubit.isClosed &&
      identical(context.read<AuthCubit>(), auth) &&
      identical(context.read<ProfileCubit>(), cubit) &&
      auth.state.user?.id == actor &&
      cubit.state.profile?.id == actor;
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
              title: Text(toastContext.l10n.profileAvatarUpdateError),
            ),
    );
  } finally {
    await subscription.cancel();
  }
}
