import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantAttachmentSheetBody extends StatelessWidget {
  const AssistantAttachmentSheetBody({
    required this.hasAttachments,
    required this.onPickFiles,
    required this.onPickGalleryMedia,
    required this.onClearAttachments,
    this.onCapture,
    super.key,
  });

  final Future<void> Function()? onCapture;
  final bool hasAttachments;
  final Future<void> Function() onPickFiles;
  final Future<void> Function() onPickGalleryMedia;
  final Future<void> Function() onClearAttachments;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppActionSheet<void>(
      title: l10n.assistantAttachmentSheetTitle,
      actions: [
        AppSheetAction(
          icon: LucideIcons.paperclip,
          tone: AppTone.primary,
          label: l10n.assistantAttachFilesSource,
          onPressed: onPickFiles,
        ),
        AppSheetAction(
          icon: LucideIcons.images,
          tone: AppTone.primary,
          label: l10n.assistantAttachGalleryMediaAction,
          onPressed: onPickGalleryMedia,
        ),
        if (onCapture case final onCapture?)
          AppSheetAction(
            icon: LucideIcons.camera,
            tone: AppTone.primary,
            label: l10n.assistantAttachCaptureAction,
            onPressed: onCapture,
          ),
        if (hasAttachments)
          AppSheetAction(
            icon: LucideIcons.listX,
            label: l10n.assistantAttachmentClearAction,
            destructive: true,
            onPressed: onClearAttachments,
          ),
      ],
    );
  }
}
