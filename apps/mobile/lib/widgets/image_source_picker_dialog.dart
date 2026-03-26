import 'package:flutter/material.dart' hide Scaffold;
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<ImageSource?> showImageSourcePickerDialog({
  required BuildContext context,
  required String title,
  required String cameraLabel,
  required String galleryLabel,
  String? description,
  IconData icon = Icons.add_a_photo_outlined,
}) {
  return showAdaptiveSheet<ImageSource>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) => AppDialogScaffold(
      title: title,
      description: description,
      icon: icon,
      maxWidth: 420,
      maxHeightFactor: 0.62,
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogContext).pop(
                    ImageSource.camera,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.camera_alt_rounded),
                      const shad.Gap(8),
                      Flexible(child: Text(cameraLabel)),
                    ],
                  ),
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: shad.PrimaryButton(
                  onPressed: () => Navigator.of(dialogContext).pop(
                    ImageSource.gallery,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.photo_library_rounded),
                      const shad.Gap(8),
                      Flexible(child: Text(galleryLabel)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
