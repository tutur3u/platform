import 'package:flutter/material.dart';
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
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.attach_file_rounded),
                title: Text(context.l10n.assistantAttachFilesSource),
                onTap: onPickFiles,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.photo_library_outlined),
                title: Text(context.l10n.assistantAttachGalleryMediaAction),
                onTap: onPickGalleryMedia,
              ),
              if (onCapture != null)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.camera_alt_outlined),
                  title: Text(context.l10n.assistantAttachCaptureAction),
                  onTap: onCapture,
                ),
              if (hasAttachments)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.clear_all_rounded),
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
