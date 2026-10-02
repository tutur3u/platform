import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';

const _sentinel = Object();

enum WorkspaceStatus { initial, loading, loaded, error }

class WorkspaceState extends Equatable {
  const WorkspaceState({
    this.status = WorkspaceStatus.initial,
    this.workspaces = const [],
    this.currentWorkspace,
    this.defaultWorkspace,
    this.hiddenModuleIds = const [],
    this.limits,
    this.error,
    this.isCreating = false,
    this.emptyMembershipConfirmed = false,
    this.hiddenWorkspaceIds = const [],
    this.pendingVisibilityIds = const [],
    this.visibilityStatus = WorkspaceStatus.initial,
    this.visibilityError,
    this.visibilityResolved = false,
  });

  final List<String> hiddenWorkspaceIds;
  final List<String> pendingVisibilityIds;
  final WorkspaceStatus visibilityStatus;
  final String? visibilityError;
  final bool visibilityResolved;

  /// UI-only list. Keep workspaces canonical for reminders and access.
  List<Workspace> get visibleWorkspaces => workspaces
      .where((workspace) => !hiddenWorkspaceIds.contains(workspace.id))
      .toList(growable: false);
  List<Workspace> get hiddenWorkspaces => workspaces
      .where((workspace) => hiddenWorkspaceIds.contains(workspace.id))
      .toList(growable: false);

  final WorkspaceStatus status;
  final List<Workspace> workspaces;
  final Workspace? currentWorkspace;
  final Workspace? defaultWorkspace;
  final List<String> hiddenModuleIds;
  final WorkspaceLimits? limits;
  final String? error;
  final bool isCreating;

  /// An empty cache or failed fetch is not evidence of removed membership.
  final bool emptyMembershipConfirmed;

  bool get hasWorkspace => currentWorkspace != null;
  Workspace? get personalWorkspaceOrCurrent {
    for (final workspace in workspaces) {
      if (workspace.personal) return workspace;
    }
    return currentWorkspace;
  }

  WorkspaceState copyWith({
    WorkspaceStatus? status,
    List<Workspace>? workspaces,
    Object? currentWorkspace = _sentinel,
    Object? defaultWorkspace = _sentinel,
    List<String>? hiddenModuleIds,
    Object? limits = _sentinel,
    Object? error = _sentinel,
    bool? isCreating,
    bool? emptyMembershipConfirmed,
    List<String>? hiddenWorkspaceIds,
    List<String>? pendingVisibilityIds,
    WorkspaceStatus? visibilityStatus,
    Object? visibilityError = _sentinel,
    bool? visibilityResolved,
  }) => WorkspaceState(
    visibilityResolved: visibilityResolved ?? this.visibilityResolved,
    hiddenWorkspaceIds: hiddenWorkspaceIds ?? this.hiddenWorkspaceIds,
    pendingVisibilityIds: pendingVisibilityIds ?? this.pendingVisibilityIds,
    visibilityStatus: visibilityStatus ?? this.visibilityStatus,
    visibilityError: visibilityError == _sentinel
        ? this.visibilityError
        : visibilityError as String?,
    status: status ?? this.status,
    workspaces: workspaces ?? this.workspaces,
    currentWorkspace: currentWorkspace == _sentinel
        ? this.currentWorkspace
        : currentWorkspace as Workspace?,
    defaultWorkspace: defaultWorkspace == _sentinel
        ? this.defaultWorkspace
        : defaultWorkspace as Workspace?,
    hiddenModuleIds: hiddenModuleIds ?? this.hiddenModuleIds,
    limits: limits == _sentinel ? this.limits : limits as WorkspaceLimits?,
    error: error == _sentinel ? this.error : error as String?,
    isCreating: isCreating ?? this.isCreating,
    emptyMembershipConfirmed:
        emptyMembershipConfirmed ?? this.emptyMembershipConfirmed,
  );

  @override
  List<Object?> get props => [
    hiddenWorkspaceIds,
    pendingVisibilityIds,
    visibilityStatus,
    visibilityResolved,
    visibilityError,
    status,
    workspaces,
    currentWorkspace,
    defaultWorkspace,
    hiddenModuleIds,
    limits,
    error,
    isCreating,
    emptyMembershipConfirmed,
  ];
}
