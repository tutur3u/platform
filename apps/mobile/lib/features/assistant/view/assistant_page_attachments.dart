part of 'assistant_page.dart';

extension _AssistantAttachments on _AssistantPageState {
  Future<void> _recordVoiceMessage(String wsId) async {
    final recording = await showAdaptiveSheet<AssistantVoiceMessageResult>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => const AssistantVoiceMessageSheet(),
    );
    if (!mounted || recording == null || _chatCubit.state.workspaceId != wsId) {
      return;
    }
    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: [recording.file],
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
    );
    if (mounted && recording.sendNow) {
      await _handleSend(
        wsId,
        _shellCubit.state,
        _chatCubit.state,
        _liveCubit.state,
      );
    }
  }

  Future<void> _pickFiles(String wsId) async {
    final result = await FilePicker.pickFiles();
    if (result.isEmpty || !mounted || _chatCubit.state.workspaceId != wsId) {
      return;
    }

    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: result,
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
    );
  }

  Future<void> _pickGalleryMedia(String wsId) async {
    try {
      final media = await ImagePicker().pickMultipleMedia();
      if (media.isEmpty || !mounted || _chatCubit.state.workspaceId != wsId) {
        return;
      }
      final files = media.map(GalleryPlatformFile.new).toList();
      if (!mounted) return;
      await _chatCubit.addComposerAttachments(
        wsId: wsId,
        files: files,
        modelId: _shellCubit.state.selectedModel.value,
        timezone: await getCurrentTimezoneIdentifier(),
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
  }

  Future<void> _showAttachmentSheet(BuildContext context, String wsId) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantAttachmentSheetBody(
        hasAttachments: _chatCubit.state.composerAttachments.isNotEmpty,
        onPickFiles: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _pickFiles(wsId);
        },
        onPickGalleryMedia: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _pickGalleryMedia(wsId);
        },
        onCapture: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _showCaptureSheet(wsId);
        },
        onClearAttachments: () async {
          final attachments = _chatCubit.state.composerAttachments
              .map((attachment) => attachment.id)
              .toList(growable: false);
          await Navigator.of(sheetContext).maybePop();
          for (final attachmentId in attachments) {
            await _chatCubit.removeComposerAttachment(
              wsId: wsId,
              attachmentId: attachmentId,
            );
          }
        },
      ),
    );
  }

  Future<void> _showCaptureSheet(String wsId) async {
    final cameraSupported =
        !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.iOS ||
            defaultTargetPlatform == TargetPlatform.android);
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantCaptureSheet(
        cameraSupported: cameraSupported,
        onPhoto: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _captureMedia(wsId, video: false);
        },
        onVideo: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _captureMedia(wsId, video: true);
        },
        onAudio: () async {
          await Navigator.of(sheetContext).maybePop();
          if (mounted) await _recordVoiceMessage(wsId);
        },
      ),
    );
  }

  Future<void> _captureMedia(String wsId, {required bool video}) async {
    try {
      final picker = ImagePicker();
      final media = video
          ? await picker.pickVideo(source: ImageSource.camera)
          : await picker.pickImage(source: ImageSource.camera);
      if (!mounted || media == null || _chatCubit.state.workspaceId != wsId) {
        return;
      }
      await _chatCubit.addComposerAttachments(
        wsId: wsId,
        files: [GalleryPlatformFile(media)],
        modelId: _shellCubit.state.selectedModel.value,
        timezone: await getCurrentTimezoneIdentifier(),
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
  }
}
