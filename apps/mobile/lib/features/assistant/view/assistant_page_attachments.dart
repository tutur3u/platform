part of 'assistant_page.dart';

extension _AssistantAttachments on _AssistantPageState {
  Future<void> _recordVoiceMessage(String wsId) async {
    if (_voiceCapture.state.visible) return;
    final actorId = context.read<AuthCubit?>()?.state.user?.id;
    if (actorId == null || _chatCubit.state.workspaceId != wsId) return;
    _voiceWorkspaceId = wsId;
    _voiceActorId = actorId;
    _voiceScopeVersion = _chatCubit.attachmentScopeVersion;
    _inputFocusNode.unfocus();
    await _voiceCapture.start();
  }

  Future<void> _finishVoiceRecording({required bool sendNow}) async {
    final wsId = _voiceWorkspaceId;
    final scopeVersion = _voiceScopeVersion;
    final actorId = _voiceActorId;
    final captureToken = _voiceCapture.sessionToken;
    final actorScopeEpoch = _voiceActorScopeEpoch;
    bool isCurrent() =>
        mounted &&
        wsId != null &&
        scopeVersion != null &&
        _voiceActorScopeEpoch == actorScopeEpoch &&
        _loadedWorkspaceId == wsId &&
        context.read<AuthCubit?>()?.state.user?.id == actorId &&
        _chatCubit.state.workspaceId == wsId &&
        _chatCubit.attachmentScopeVersion == scopeVersion;
    if (!isCurrent()) {
      await _voiceCapture.cancel();
      return;
    }
    final file = await _voiceCapture.takeRecording();
    if (file == null ||
        !isCurrent() ||
        _voiceCapture.sessionToken != captureToken) {
      return;
    }
    final timezone = await getCurrentTimezoneIdentifier();
    if (!isCurrent() || _voiceCapture.sessionToken != captureToken) return;
    await _chatCubit.addComposerAttachments(
      wsId: wsId!,
      files: [file],
      modelId: _shellCubit.state.selectedModel.value,
      timezone: timezone,
      expectedWorkspaceVersion: scopeVersion,
      isCurrentActor: isCurrent,
    );
    if (sendNow && isCurrent()) {
      await _handleSend(
        wsId,
        _shellCubit.state,
        _chatCubit.state,
        _liveCubit.state,
      );
    }
  }

  Future<void> _pickFiles(String wsId) async {
    final scopeVersion = _chatCubit.attachmentScopeVersion;
    final result = await FilePicker.pickFiles();
    if (result.isEmpty || !mounted || _chatCubit.state.workspaceId != wsId) {
      return;
    }

    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: result,
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
      expectedWorkspaceVersion: scopeVersion,
    );
  }

  Future<void> _pickGalleryMedia(String wsId) async {
    final scopeVersion = _chatCubit.attachmentScopeVersion;
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
        expectedWorkspaceVersion: scopeVersion,
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
    final scopeVersion = _chatCubit.attachmentScopeVersion;
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
        expectedWorkspaceVersion: scopeVersion,
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
  }
}
