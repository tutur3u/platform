import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_sharing_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

const forbidden = ApiException(message: 'Forbidden', statusCode: 403);
const offline = ApiException.transport(message: 'Network unreachable');

final fixedAt = DateTime.utc(2026, 11, 20, 9, 30);

const ada = TaskPerson(id: 'ada', displayName: 'Ada Lovelace');
const me = TaskPerson(id: 'me', displayName: 'Minh Tran');

TaskComment comment(String id, String body, {TaskPerson author = ada}) =>
    TaskComment(id: id, body: body, author: author, createdAt: fixedAt);

/// Serves comments, links, timeline pages and snapshots from memory; set a
/// `fail*` field to make the matching call throw.
class FakeCollabRepository extends TaskCollaborationRepository {
  FakeCollabRepository() : super(apiClient: MockApiClient());

  List<TaskComment> comments = [];
  List<TaskLink> links = [];
  List<TaskPage<TaskTimelineEvent>> pages = const [TaskPage(items: [])];
  TaskSnapshot snapshotValue = const TaskSnapshot();
  Exception? failLoad;
  Exception? failWrite;
  final calls = <String>[];
  List<TaskRevertField>? revertedFields;

  void _check(Exception? failure) {
    if (failure != null) throw failure;
  }

  @override
  Future<List<TaskComment>> listComments(
    String wsId,
    String taskId, {
    int limit = 100,
  }) async {
    calls.add('comments');
    _check(failLoad);
    return comments;
  }

  @override
  Future<TaskComment> addComment(
    String wsId,
    String taskId,
    String body,
  ) async {
    calls.add('add:$body');
    _check(failWrite);
    return comment('new-${calls.length}', body, author: me);
  }

  @override
  Future<TaskComment> editComment(
    String wsId,
    String taskId,
    String commentId,
    String body,
  ) async {
    calls.add('edit:$commentId:$body');
    _check(failWrite);
    return comment(commentId, body, author: me);
  }

  @override
  Future<void> deleteComment(
    String wsId,
    String taskId,
    String commentId,
  ) async {
    calls.add('delete:$commentId');
    _check(failWrite);
  }

  @override
  Future<List<TaskLink>> listLinks(String wsId, String taskId) async {
    calls.add('links');
    _check(failLoad);
    return links;
  }

  @override
  Future<TaskLink> addLink(String wsId, String taskId, String url) async {
    calls.add('addLink:$url');
    _check(failWrite);
    return TaskLink(
      id: 'link-${calls.length}',
      url: url,
      kind: TaskLinkKind.url,
    );
  }

  @override
  Future<void> removeLink(String wsId, String taskId, String linkId) async {
    calls.add('removeLink:$linkId');
    _check(failWrite);
  }

  @override
  Future<TaskPage<TaskTimelineEvent>> listTimeline(
    String wsId,
    String taskId, {
    String? cursor,
    int limit = 50,
  }) async {
    calls.add('timeline:${cursor ?? ''}');
    _check(failLoad);
    final index = cursor == null ? 0 : int.parse(cursor);
    return pages[index];
  }

  @override
  Future<TaskSnapshot> snapshot(
    String wsId,
    String taskId,
    String historyId,
  ) async {
    calls.add('snapshot:$historyId');
    _check(failLoad);
    return snapshotValue;
  }

  @override
  Future<void> revert(
    String wsId,
    String taskId,
    String historyId,
    List<TaskRevertField> fields,
  ) async {
    calls.add('revert:$historyId');
    _check(failWrite);
    revertedFields = fields;
  }
}

/// Task and board sharing from memory.
class FakeSharingRepository extends TaskSharingRepository {
  FakeSharingRepository()
    : super(apiClient: MockApiClient(), shareOrigin: 'https://tasks.test');

  TaskShareLink taskLink = const TaskShareLink(id: 'link-1', code: 'abc123');
  BoardPublicLink? boardLink;
  List<ShareGrant> shares = [];
  Exception? failLoad;
  Exception? failWrite;
  final calls = <String>[];

  void _check(Exception? failure) {
    if (failure != null) throw failure;
  }

  @override
  Future<TaskShareLink> taskShareLink(String wsId, String taskId) async {
    _check(failLoad);
    return taskLink;
  }

  @override
  Future<List<ShareGrant>> taskShares(String wsId, String taskId) async {
    _check(failLoad);
    return shares;
  }

  @override
  Future<TaskShareLink> updateTaskShareLink(
    String wsId,
    String taskId, {
    bool? publicAccess,
    bool? requiresInvite,
  }) async {
    calls.add('link:$publicAccess:$requiresInvite');
    _check(failWrite);
    return taskLink = TaskShareLink(
      id: taskLink.id,
      code: taskLink.code,
      // Invite-only turns public access off, as the route does.
      publicAccess:
          requiresInvite != true && (publicAccess ?? taskLink.publicAccess),
      requiresInvite: requiresInvite ?? taskLink.requiresInvite,
    );
  }

  @override
  Future<void> revokeTaskShareLink(
    String wsId,
    String taskId,
    String linkId,
  ) async {
    calls.add('revoke:$linkId');
    _check(failWrite);
    taskLink = const TaskShareLink(id: 'link-2', code: 'fresh9');
  }

  @override
  Future<void> addTaskShare(String wsId, String taskId, String email) async {
    calls.add('share:$email');
    _check(failWrite);
    shares = [
      ...shares,
      ShareGrant(
        id: 'share-${shares.length}',
        permission: SharePermission.view,
        email: email,
      ),
    ];
  }

  @override
  Future<void> updateTaskShare(
    String wsId,
    String taskId,
    String shareId,
    SharePermission permission,
  ) async {
    calls.add('permission:$shareId:${permission.name}');
    _check(failWrite);
  }

  @override
  Future<void> removeTaskShare(
    String wsId,
    String taskId,
    String shareId,
  ) async {
    calls.add('unshare:$shareId');
    _check(failWrite);
    shares = [
      for (final share in shares)
        if (share.id != shareId) share,
    ];
  }

  @override
  Future<BoardPublicLink?> boardPublicLink(String wsId, String boardId) async {
    _check(failLoad);
    return boardLink;
  }

  @override
  Future<List<ShareGrant>> boardShares(String wsId, String boardId) async {
    _check(failLoad);
    return shares;
  }

  @override
  Future<BoardPublicLink> enableBoardPublicLink(
    String wsId,
    String boardId,
  ) async {
    calls.add('enable');
    _check(failWrite);
    return boardLink = const BoardPublicLink(id: 'public-1', code: 'board7');
  }

  @override
  Future<void> disableBoardPublicLink(String wsId, String boardId) async {
    calls.add('disable');
    _check(failWrite);
    boardLink = null;
  }

  @override
  Future<void> addBoardShare(
    String wsId,
    String boardId,
    String email,
    SharePermission permission,
  ) async {
    calls.add('guest:$email:${permission.name}');
    _check(failWrite);
    shares = [
      ...shares,
      ShareGrant(
        id: 'guest-${shares.length}',
        permission: permission,
        email: email,
      ),
    ];
  }

  @override
  Future<void> removeBoardShare(
    String wsId,
    String boardId,
    String shareId,
  ) async {
    calls.add('unguest:$shareId');
    _check(failWrite);
  }
}
