import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/documents/document_mentions.dart';

/// The most tasks the picker lists before the search narrows them.
const int _taskLimit = 200;

/// Everything in [workspace] the web's mention menu offers: its members
/// (sorted by name), the workspace itself unless it is personal, its task
/// projects and its tasks. A source that fails to load is left out, so one
/// unavailable list does not hide the others.
Future<List<DocumentMentionOption>> loadDocumentMentionOptions(
  TaskRepository repository,
  Workspace workspace,
) async {
  final wsId = workspace.id;
  Future<List<T>> safe<T>(Future<List<T>> Function() load) async {
    try {
      return await load();
    } on Object {
      return const [];
    }
  }

  final (members, projects, tasks) = await (
    safe(() => repository.getWorkspaceUsers(wsId)),
    safe(() => repository.getTaskProjects(wsId)),
    safe(() => repository.getWorkspaceTasksForProjectLinking(wsId)),
  ).wait;

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
            : 'Workspace',
        subtitle: wsId.length > 8 ? wsId.substring(0, 8) : wsId,
        type: DocumentMentionType.workspace,
      ),
    for (final project in projects)
      DocumentMentionOption(
        id: project.id,
        label: project.name.trim().isEmpty ? 'Untitled project' : project.name,
        subtitle: project.status,
        type: DocumentMentionType.project,
      ),
    for (final task in tasks.take(_taskLimit))
      DocumentMentionOption(
        id: task.id,
        label: task.name.trim().isEmpty ? 'Untitled task' : task.name,
        subtitle: task.listName,
        displayNumber: task.displayNumber,
        priority: task.priority,
        workspaceId: wsId,
        type: DocumentMentionType.task,
      ),
  ];
}
