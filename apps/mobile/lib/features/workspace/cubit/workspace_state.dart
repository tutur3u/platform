import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/workspace.dart';

enum WorkspaceStatus { initial, loading, loaded, error }

class WorkspaceState extends Equatable {
  const WorkspaceState({
    this.status = WorkspaceStatus.initial,
    this.workspaces = const [],
    this.currentWorkspace,
    this.error,
  });

  final WorkspaceStatus status;
  final List<Workspace> workspaces;
  final Workspace? currentWorkspace;
  final String? error;

  bool get hasWorkspace => currentWorkspace != null;

  WorkspaceState copyWith({
    WorkspaceStatus? status,
    List<Workspace>? workspaces,
    Workspace? currentWorkspace,
    String? error,
  }) => WorkspaceState(
    status: status ?? this.status,
    workspaces: workspaces ?? this.workspaces,
    currentWorkspace: currentWorkspace ?? this.currentWorkspace,
    error: error,
  );

  @override
  List<Object?> get props => [status, workspaces, currentWorkspace, error];
}
