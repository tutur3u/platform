part of 'assistant_shell_cubit.dart';

enum AssistantShellStatus { initial, loading, loaded, error }

const _assistantShellSentinel = Object();

class AssistantShellState extends Equatable {
  const AssistantShellState({
    this.status = AssistantShellStatus.initial,
    this.workspace,
    this.soul = const AssistantSoul(),
    this.personalWorkspaceId,
    this.tasksInsight = const AssistantTasksInsight(),
    this.calendarInsight = const AssistantCalendarInsight(),
    this.workspaceCredits = const AssistantCredits(),
    this.personalCredits = const AssistantCredits(),
    this.activeCredits = const AssistantCredits(),
    this.availableModels = const [],
    this.selectedModel = _defaultAssistantModel,
    this.thinkingMode = AssistantThinkingMode.fast,
    this.creditSource = AssistantCreditSource.workspace,
    this.workspaceContextId = 'personal',
    this.workspaceCreditLocked = false,
    this.isPersonalDashboardWorkspace = false,
    this.isImmersive = false,
    this.isViewOnly = false,
    this.error,
  });

  final AssistantShellStatus status;
  final Workspace? workspace;
  final AssistantSoul soul;
  final String? personalWorkspaceId;
  final AssistantTasksInsight tasksInsight;
  final AssistantCalendarInsight calendarInsight;
  final AssistantCredits workspaceCredits;
  final AssistantCredits personalCredits;
  final AssistantCredits activeCredits;
  final List<AssistantGatewayModel> availableModels;
  final AssistantGatewayModel selectedModel;
  final AssistantThinkingMode thinkingMode;
  final AssistantCreditSource creditSource;
  final String workspaceContextId;
  final bool workspaceCreditLocked;
  final bool isPersonalDashboardWorkspace;
  final bool isImmersive;
  final bool isViewOnly;
  final String? error;

  bool get hasWorkspace => workspace != null;

  AssistantShellState copyWith({
    AssistantShellStatus? status,
    Object? workspace = _assistantShellSentinel,
    AssistantSoul? soul,
    Object? personalWorkspaceId = _assistantShellSentinel,
    AssistantTasksInsight? tasksInsight,
    AssistantCalendarInsight? calendarInsight,
    AssistantCredits? workspaceCredits,
    AssistantCredits? personalCredits,
    AssistantCredits? activeCredits,
    List<AssistantGatewayModel>? availableModels,
    AssistantGatewayModel? selectedModel,
    AssistantThinkingMode? thinkingMode,
    AssistantCreditSource? creditSource,
    String? workspaceContextId,
    bool? workspaceCreditLocked,
    bool? isPersonalDashboardWorkspace,
    bool? isImmersive,
    bool? isViewOnly,
    Object? error = _assistantShellSentinel,
    bool clearError = false,
  }) {
    return AssistantShellState(
      status: status ?? this.status,
      workspace: workspace == _assistantShellSentinel
          ? this.workspace
          : workspace as Workspace?,
      soul: soul ?? this.soul,
      personalWorkspaceId: personalWorkspaceId == _assistantShellSentinel
          ? this.personalWorkspaceId
          : personalWorkspaceId as String?,
      tasksInsight: tasksInsight ?? this.tasksInsight,
      calendarInsight: calendarInsight ?? this.calendarInsight,
      workspaceCredits: workspaceCredits ?? this.workspaceCredits,
      personalCredits: personalCredits ?? this.personalCredits,
      activeCredits: activeCredits ?? this.activeCredits,
      availableModels: availableModels ?? this.availableModels,
      selectedModel: selectedModel ?? this.selectedModel,
      thinkingMode: thinkingMode ?? this.thinkingMode,
      creditSource: creditSource ?? this.creditSource,
      workspaceContextId: workspaceContextId ?? this.workspaceContextId,
      workspaceCreditLocked:
          workspaceCreditLocked ?? this.workspaceCreditLocked,
      isPersonalDashboardWorkspace:
          isPersonalDashboardWorkspace ?? this.isPersonalDashboardWorkspace,
      isImmersive: isImmersive ?? this.isImmersive,
      isViewOnly: isViewOnly ?? this.isViewOnly,
      error: clearError
          ? null
          : error == _assistantShellSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    workspace,
    soul,
    personalWorkspaceId,
    tasksInsight,
    calendarInsight,
    workspaceCredits,
    personalCredits,
    activeCredits,
    availableModels,
    selectedModel,
    thinkingMode,
    creditSource,
    workspaceContextId,
    workspaceCreditLocked,
    isPersonalDashboardWorkspace,
    isImmersive,
    isViewOnly,
    error,
  ];
}
