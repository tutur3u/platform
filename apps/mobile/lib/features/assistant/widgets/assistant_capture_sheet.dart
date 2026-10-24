import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';

/// Camera actions only appear on platforms implemented by image_picker.
class AssistantCaptureSheet extends StatelessWidget {
  const AssistantCaptureSheet({
    required this.cameraSupported,
    required this.onPhoto,
    required this.onVideo,
    required this.onAudio,
    super.key,
  });
  final bool cameraSupported;
  final Future<void> Function() onPhoto;
  final Future<void> Function() onVideo;
  final Future<void> Function() onAudio;
  @override
  Widget build(BuildContext context) => AssistantDockSurface(
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (cameraSupported) ...[
              AppListTile(
                leading: const Icon(LucideIcons.camera),
                title: Text(context.l10n.assistantCapturePhoto),
                onTap: onPhoto,
              ),
              AppListTile(
                leading: const Icon(LucideIcons.video),
                title: Text(context.l10n.assistantCaptureVideo),
                onTap: onVideo,
              ),
            ],
            AppListTile(
              leading: const Icon(LucideIcons.mic),
              title: Text(context.l10n.assistantCaptureAudio),
              onTap: onAudio,
            ),
          ],
        ),
      ),
    ),
  );
}
