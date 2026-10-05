part of 'assistant_page.dart';

extension _AssistantAttachments on _AssistantPageState {
  Future<void> _recordVoiceMessage(String wsId) async {
    if (!_remoteGuard(wsId).current || _voiceCapture.state.visible) return;
    final actorId = context.read<AuthCubit?>()?.state.user?.id;
    if (actorId == null || _chatCubit.state.workspaceId != wsId) return;
    _voiceWorkspaceId = wsId;
    _voiceActorId = actorId;
    _voiceScopeVersion = _chatCubit.attachmentScopeVersion;
    _voiceLocalVersion = _localCubit.scopeVersion;
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
        !_localCubit.state.local &&
        !_localCubit.state.blocked &&
        _voiceLocalVersion == _localCubit.scopeVersion &&
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
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final scopeVersion = _chatCubit.attachmentScopeVersion;
    final result = await FilePicker.pickFiles();
    if (result.isEmpty ||
        !guard.current ||
        _chatCubit.state.workspaceId != wsId) {
      return;
    }

    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: result,
      modelId: _shellCubit.state.selectedModel.value,
      timezone: await getCurrentTimezoneIdentifier(),
      expectedWorkspaceVersion: scopeVersion,
      isCurrentActor: () => guard.current,
    );
  }

  Future<void> _pickGalleryMedia(String wsId) async {
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final scopeVersion = _chatCubit.attachmentScopeVersion;
    try {
      final media = await ImagePicker().pickMultipleMedia();
      if (media.isEmpty ||
          !guard.current ||
          _chatCubit.state.workspaceId != wsId) {
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
        isCurrentActor: () => guard.current,
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
  }

  Future<void> _showAttachmentSheet(BuildContext context, String wsId) async {
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantAttachmentSheetBody(
        hasAttachments: _chatCubit.state.composerAttachments.isNotEmpty,
        onPickFiles: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _pickFiles(wsId);
        },
        onPickGalleryMedia: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _pickGalleryMedia(wsId);
        },
        onCapture: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _showCaptureSheet(wsId);
        },
        onClearAttachments: () async {
          final attachments = _chatCubit.state.composerAttachments
              .map((attachment) => attachment.id)
              .toList(growable: false);
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          for (final attachmentId in attachments) {
            if (!guard.current) return;
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
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final cameraSupported =
        !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.iOS ||
            defaultTargetPlatform == TargetPlatform.android);
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantCaptureSheet(
        cameraSupported: cameraSupported,
        onPhoto: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _captureMedia(wsId, video: false);
        },
        onVideo: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _captureMedia(wsId, video: true);
        },
        onAudio: () async {
          if (!await guard.run(() async {
            await Navigator.of(sheetContext).maybePop();
          })) {
            return;
          }
          if (mounted) await _recordVoiceMessage(wsId);
        },
      ),
    );
  }

  Future<void> _captureMedia(String wsId, {required bool video}) async {
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    final scopeVersion = _chatCubit.attachmentScopeVersion;
    try {
      final picker = ImagePicker();
      final media = video
          ? await picker.pickVideo(source: ImageSource.camera)
          : await picker.pickImage(source: ImageSource.camera);
      if (!guard.current ||
          media == null ||
          _chatCubit.state.workspaceId != wsId) {
        return;
      }
      await _chatCubit.addComposerAttachments(
        wsId: wsId,
        files: [GalleryPlatformFile(media)],
        modelId: _shellCubit.state.selectedModel.value,
        timezone: await getCurrentTimezoneIdentifier(),
        expectedWorkspaceVersion: scopeVersion,
        isCurrentActor: () => guard.current,
      );
    } on Exception {
      if (mounted) _showInlineNotice(context.l10n.assistantGalleryPickError);
    }
  }
}
