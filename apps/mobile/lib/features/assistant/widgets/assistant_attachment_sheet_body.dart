import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
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
    return SafeArea(
      top: false,
      child: AssistantDockSurface(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.assistantAttachmentSheetTitle,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              AppListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(LucideIcons.paperclip),
                title: Text(context.l10n.assistantAttachFilesSource),
                onTap: onPickFiles,
              ),
              AppListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(LucideIcons.images),
                title: Text(context.l10n.assistantAttachGalleryMediaAction),
                onTap: onPickGalleryMedia,
              ),
              if (onCapture != null)
                AppListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(LucideIcons.camera),
                  title: Text(context.l10n.assistantAttachCaptureAction),
                  onTap: onCapture,
                ),
              if (hasAttachments)
                AppListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(LucideIcons.listX),
                  title: Text(context.l10n.assistantAttachmentClearAction),
                  onTap: onClearAttachments,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
