part of 'assistant_live_cubit.dart';

enum AssistantLivePermissionState { unknown, granted, denied }

const _assistantLiveSentinel = Object();

class AssistantLiveState extends Equatable {
  const AssistantLiveState({
    this.workspaceId,
    this.chatId,
    this.scopeKey,
    this.model,
    this.sessionHandle,
    this.status = AssistantLiveConnectionStatus.disconnected,
    this.microphonePermission = AssistantLivePermissionState.unknown,
    this.cameraPermission = AssistantLivePermissionState.unknown,
    this.isMicrophoneActive = false,
    this.isCameraActive = false,
    this.isInterrupted = false,
    this.isPersisting = false,
    this.audioLevel = 0,
    this.assistantAudioLevel = 0,
    this.isAssistantSpeaking = false,
    this.latestCameraFrame,
    this.userDraft = '',
    this.userTranscript = '',
    this.assistantDraft = '',
    this.assistantTranscript = '',
    this.insightCards = const [],
    this.goAwayTimeLeft,
    this.error,
  });

  final String? workspaceId;
  final String? chatId;
  final String? scopeKey;
  final String? model;
  final String? sessionHandle;
  final AssistantLiveConnectionStatus status;
  final AssistantLivePermissionState microphonePermission;
  final AssistantLivePermissionState cameraPermission;
  final bool isMicrophoneActive;
  final bool isCameraActive;
  final bool isInterrupted;
  final bool isPersisting;
  final double audioLevel;
  final double assistantAudioLevel;
  final bool isAssistantSpeaking;
  final Uint8List? latestCameraFrame;
  final String userDraft;
  final String userTranscript;
  final String assistantDraft;
  final String assistantTranscript;
  final List<AssistantLiveInsightCard> insightCards;
  final String? goAwayTimeLeft;
  final String? error;

  bool get isBusy =>
      status == AssistantLiveConnectionStatus.preparing ||
      status == AssistantLiveConnectionStatus.connecting ||
      status == AssistantLiveConnectionStatus.reconnecting;

  bool get hasDraft =>
      userDraft.isNotEmpty ||
      userTranscript.isNotEmpty ||
      assistantDraft.isNotEmpty ||
      assistantTranscript.isNotEmpty;

  AssistantLiveState copyWith({
    Object? workspaceId = _assistantLiveSentinel,
    Object? chatId = _assistantLiveSentinel,
    Object? scopeKey = _assistantLiveSentinel,
    Object? model = _assistantLiveSentinel,
    Object? sessionHandle = _assistantLiveSentinel,
    AssistantLiveConnectionStatus? status,
    AssistantLivePermissionState? microphonePermission,
    AssistantLivePermissionState? cameraPermission,
    bool? isMicrophoneActive,
    bool? isCameraActive,
    bool? isInterrupted,
    bool? isPersisting,
    double? audioLevel,
    double? assistantAudioLevel,
    bool? isAssistantSpeaking,
    Object? latestCameraFrame = _assistantLiveSentinel,
    String? userDraft,
    String? userTranscript,
    String? assistantDraft,
    String? assistantTranscript,
    List<AssistantLiveInsightCard>? insightCards,
    Object? goAwayTimeLeft = _assistantLiveSentinel,
    Object? error = _assistantLiveSentinel,
    bool clearError = false,
  }) {
    return AssistantLiveState(
      workspaceId: workspaceId == _assistantLiveSentinel
          ? this.workspaceId
          : workspaceId as String?,
      chatId: chatId == _assistantLiveSentinel
          ? this.chatId
          : chatId as String?,
      scopeKey: scopeKey == _assistantLiveSentinel
          ? this.scopeKey
          : scopeKey as String?,
      model: model == _assistantLiveSentinel ? this.model : model as String?,
      sessionHandle: sessionHandle == _assistantLiveSentinel
          ? this.sessionHandle
          : sessionHandle as String?,
      status: status ?? this.status,
      microphonePermission: microphonePermission ?? this.microphonePermission,
      cameraPermission: cameraPermission ?? this.cameraPermission,
      isMicrophoneActive: isMicrophoneActive ?? this.isMicrophoneActive,
      isCameraActive: isCameraActive ?? this.isCameraActive,
      isInterrupted: isInterrupted ?? this.isInterrupted,
      isPersisting: isPersisting ?? this.isPersisting,
      audioLevel: audioLevel ?? this.audioLevel,
      assistantAudioLevel: assistantAudioLevel ?? this.assistantAudioLevel,
      isAssistantSpeaking: isAssistantSpeaking ?? this.isAssistantSpeaking,
      latestCameraFrame: latestCameraFrame == _assistantLiveSentinel
          ? this.latestCameraFrame
          : latestCameraFrame as Uint8List?,
      userDraft: userDraft ?? this.userDraft,
      userTranscript: userTranscript ?? this.userTranscript,
      assistantDraft: assistantDraft ?? this.assistantDraft,
      assistantTranscript: assistantTranscript ?? this.assistantTranscript,
      insightCards: insightCards ?? this.insightCards,
      goAwayTimeLeft: goAwayTimeLeft == _assistantLiveSentinel
          ? this.goAwayTimeLeft
          : goAwayTimeLeft as String?,
      error: clearError
          ? null
          : error == _assistantLiveSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    workspaceId,
    chatId,
    scopeKey,
    model,
    sessionHandle,
    status,
    microphonePermission,
    cameraPermission,
    isMicrophoneActive,
    isCameraActive,
    isInterrupted,
    isPersisting,
    audioLevel,
    assistantAudioLevel,
    isAssistantSpeaking,
    latestCameraFrame,
    userDraft,
    userTranscript,
    assistantDraft,
    assistantTranscript,
    insightCards,
    goAwayTimeLeft,
    error,
  ];
}
