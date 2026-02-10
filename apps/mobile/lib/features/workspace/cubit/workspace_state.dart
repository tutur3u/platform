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
    this.limits,
    this.error,
    this.isCreating = false,
  });

  final WorkspaceStatus status;
  final List<Workspace> workspaces;
  final Workspace? currentWorkspace;
  final WorkspaceLimits? limits;
  final String? error;
  final bool isCreating;

  bool get hasWorkspace => currentWorkspace != null;

  WorkspaceState copyWith({
    WorkspaceStatus? status,
    List<Workspace>? workspaces,
    Object? currentWorkspace = _sentinel,
    Object? limits = _sentinel,
    Object? error = _sentinel,
    bool? isCreating,
  }) => WorkspaceState(
    status: status ?? this.status,
    workspaces: workspaces ?? this.workspaces,
    currentWorkspace: currentWorkspace == _sentinel
        ? this.currentWorkspace
        : currentWorkspace as Workspace?,
    limits: limits == _sentinel ? this.limits : limits as WorkspaceLimits?,
    error: error == _sentinel ? this.error : error as String?,
    isCreating: isCreating ?? this.isCreating,
  );

  @override
  List<Object?> get props => [
    status,
    workspaces,
    currentWorkspace,
    limits,
    error,
    isCreating,
  ];
}
