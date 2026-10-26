import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
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
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppActionSheet<void>(
      title: l10n.assistantAttachCaptureAction,
      actions: [
        if (cameraSupported) ...[
          AppSheetAction(
            icon: LucideIcons.camera,
            tone: AppTone.primary,
            label: l10n.assistantCapturePhoto,
            onPressed: onPhoto,
          ),
          AppSheetAction(
            icon: LucideIcons.video,
            tone: AppTone.primary,
            label: l10n.assistantCaptureVideo,
            onPressed: onVideo,
          ),
        ],
        AppSheetAction(
          icon: LucideIcons.mic,
          tone: AppTone.primary,
          label: l10n.assistantCaptureAudio,
          onPressed: onAudio,
        ),
      ],
    );
  }
}
