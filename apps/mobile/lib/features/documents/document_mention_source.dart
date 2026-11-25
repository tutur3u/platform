import 'package:http/http.dart' as http;
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/document_mentions.dart';

/// The most tasks the picker lists before a search asks the server.
const int _taskLimit = 200;

/// The most tasks one server search returns.
const int _searchLimit = 50;

/// Names for entities that have none, in the reader's language.
typedef DocumentMentionFallbacks = ({
  String workspace,
  String untitledProject,
  String untitledTask,
});

/// Where the mention picker gets workspace entities.
abstract interface class DocumentMentionSource {
  /// Members, the workspace, projects and the first tasks.
  Future<List<DocumentMentionOption>> load();

  /// Tasks matching [query], searched on the server.
  Future<List<DocumentMentionOption>> searchTasks(String query);
}

/// Mentionable entities of [workspace], read through a [TaskRepository]
/// this source owns and closes after each request.
class TaskDocumentMentionSource implements DocumentMentionSource {
  TaskDocumentMentionSource(
    this.workspace, {
    required this.fallbacks,
    TaskRepository Function(ApiClient api, http.Client client)? repository,
  }) : _repository =
           repository ??
           ((api, client) =>
               TaskRepository(apiClient: api, httpClient: client));

  final Workspace workspace;
  final DocumentMentionFallbacks fallbacks;
  final TaskRepository Function(ApiClient api, http.Client client) _repository;

  Future<T> _with<T>(Future<T> Function(TaskRepository repository) run) async {
    final api = ApiClient();
    final client = http.Client();
    try {
      return await run(_repository(api, client));
    } finally {
      api.dispose();
      client.close();
    }
  }

  /// Everything the web's mention menu offers: members (sorted by name),
  /// the workspace unless it is personal, projects and tasks. A source that
  /// fails is left out so the others still show; when all fail, the error
  /// is raised so the picker can say so and retry on its next opening.
  @override
  Future<List<DocumentMentionOption>> load() => _with((repository) async {
    final wsId = workspace.id;
    var failures = 0;
    Future<List<T>> safe<T>(Future<List<T>> Function() load) async {
      try {
        return await load();
      } on Object {
        failures++;
        return const [];
      }
    }

    final (members, projects, tasks) = await (
      safe(() => repository.getWorkspaceUsers(wsId)),
      safe(() => repository.getTaskProjects(wsId)),
      safe(() => repository.getWorkspaceTasksForProjectLinking(wsId)),
    ).wait;
    if (failures == 3) {
      throw StateError('No mentionable entities could be loaded');
    }

    String memberName(String label, String id, String? email) {
      if (label != id) return label;
      final local = email?.split('@').first.trim();
      return local == null || local.isEmpty ? label : local;
    }

    final people = [
      for (final member in members)
        DocumentMentionOption(
          id: member.id,
          label: memberName(member.label, member.id, member.email),
          avatarUrl: member.avatarUrl,
          type: DocumentMentionType.user,
        ),
    ]..sort((a, b) => a.label.compareTo(b.label));

    return [
      ...people,
      if (!workspace.personal)
        DocumentMentionOption(
          id: wsId,
          label: workspace.name?.trim().isNotEmpty ?? false
              ? workspace.name!.trim()
              : fallbacks.workspace,
          // The web shows `@handle`; mobile workspaces carry no handle, so
          // this is the web's fallback, the id's first eight characters.
          subtitle: wsId.length > 8 ? wsId.substring(0, 8) : wsId,
          type: DocumentMentionType.workspace,
        ),
      for (final project in projects)
        DocumentMentionOption(
          id: project.id,
          label: project.name.trim().isEmpty
              ? fallbacks.untitledProject
              : project.name,
          subtitle: project.status,
          type: DocumentMentionType.project,
        ),
      for (final task in tasks.take(_taskLimit)) _task(task),
    ];
  });

  @override
  Future<List<DocumentMentionOption>> searchTasks(String query) =>
      _with((repository) async {
        final result = await repository.getTimeTrackingTaskLinkOptions(
          workspace.id,
          limit: _searchLimit,
          offset: 0,
          assignedToMe: false,
          searchQuery: query,
        );
        return [for (final task in result.tasks) _task(task)];
      });

  DocumentMentionOption _task(TaskLinkOption task) => DocumentMentionOption(
    id: task.id,
    label: task.name.trim().isEmpty ? fallbacks.untitledTask : task.name,
    subtitle: task.listName,
    displayNumber: task.displayNumber,
    priority: task.priority,
    workspaceId: workspace.id,
    listColor: task.listColor,
    assignees: task.assignees,
    type: DocumentMentionType.task,
  );
}
