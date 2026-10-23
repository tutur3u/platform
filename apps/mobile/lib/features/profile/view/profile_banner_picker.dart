import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/profile/view/profile_picker_intent.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ProfileBannerPicker {
  const ProfileBannerPicker();
  Future<ImageSource?> chooseSource(BuildContext context) =>
      showImageSourcePickerDialog(
        context: context,
        title: context.l10n.profileBanner,
        cameraLabel: context.l10n.camera,
        galleryLabel: context.l10n.gallery,
      );
  Future<File?> pickImage(ImageSource source) async {
    final image = await ImagePicker().pickImage(
      source: source,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    return image == null ? null : File(image.path);
  }

  Future<File?> cropImage(BuildContext context, File file) async {
    final theme = shad.Theme.of(context);
    final cropped = await ImageCropper().cropImage(
      sourcePath: file.path,
      aspectRatio: const CropAspectRatio(ratioX: 3, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: context.l10n.profileBanner,
          toolbarColor: theme.colorScheme.primary,
          toolbarWidgetColor: theme.colorScheme.primaryForeground,
          lockAspectRatio: true,
        ),
        IOSUiSettings(
          title: context.l10n.profileBanner,
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
        ),
      ],
    );
    return cropped == null ? null : File(cropped.path);
  }
}

Future<void> pickAndUploadProfileBanner(
  BuildContext context, {
  ProfileBannerPicker picker = const ProfileBannerPicker(),
}) async {
  final intent = ProfilePickerIntent.capture(context);
  if (intent == null) return;
  intent.cubit.clearMediaFailure();
  try {
    final source = await picker.chooseSource(context);
    if (!context.mounted || !intent.current(context) || source == null) return;
    final file = await picker.pickImage(source);
    if (!context.mounted || !intent.current(context) || file == null) return;
    final cropped = await picker.cropImage(context, file);
    if (!context.mounted || !intent.current(context) || cropped == null) return;
    await intent.cubit.uploadBanner(cropped);
  } on PlatformException catch (error) {
    if (context.mounted && intent.current(context)) {
      intent.cubit.reportBannerSelectionFailure(error);
    }
  } finally {
    await intent.dispose();
  }
}
