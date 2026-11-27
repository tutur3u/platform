part of 'crm_repository.dart';

mixin _CrmGroupMembershipRepository {
  ApiClient get _api;
  String? get expectedUserId;

  String _postsPath(String wsId, String groupId) =>
      '${CrmEndpoints.userGroup(wsId, groupId)}/posts';

  Future<({List<CrmGroupPost> posts, String? nextCursor})> getGroupPostsPage(
    String wsId,
    String groupId, {
    String? cursor,
  }) async {
    final query = Uri(
      queryParameters: {'limit': '20', if (cursor != null) 'cursor': cursor},
    );
    final response = await _api.getJson('${_postsPath(wsId, groupId)}$query');
    final next = response['nextCursor'] as String?;
    return (
      posts: (response['data'] as List)
          .cast<Map<String, dynamic>>()
          .map(CrmGroupPost.fromJson)
          .toList(),
      nextCursor: next == cursor || next == '' ? null : next,
    );
  }

  Future<void> updateGroupPost(
    String wsId,
    String groupId,
    String postId,
    Map<String, String?> changes, {
    required Future<void> Function() beforeDispatch,
  }) async {
    final response = await _api.putJsonGuarded(
      '${_postsPath(wsId, groupId)}/${Uri.encodeComponent(postId)}',
      changes,
      beforeDispatch: beforeDispatch,
    );
    if (response['message'] != 'success') {
      throw StateError('Group post update was not acknowledged');
    }
  }

  String _membersPath(String wsId, String groupId) =>
      '${CrmEndpoints.userGroup(Uri.encodeComponent(wsId), Uri.encodeComponent(groupId))}/members';

  Future<({List<CrmGroupMember> members, int? next})>
  getContactGroupMembersPage(
    String wsId,
    String groupId, {
    int offset = 0,
  }) async {
    final result = await _api.getJson(
      '${_membersPath(wsId, groupId)}?offset=$offset&limit=40',
    );
    final next = result['next'] as int?;
    return (
      members: (result['data'] as List)
          .cast<Map<String, dynamic>>()
          .map(CrmGroupMember.fromJson)
          .where((member) => member.id.isNotEmpty)
          .toList(),
      next: next != null && next > offset ? next : null,
    );
  }

  Future<void> addContactGroupMember(
    String wsId,
    String groupId,
    String contactId, {
    required String role,
  }) async {
    await _api.postJson(_membersPath(wsId, groupId), {
      'memberIds': [contactId],
      'role': role,
    });
    await _invalidateMembership(wsId);
  }

  Future<void> removeContactGroupMember(
    String wsId,
    String groupId,
    String contactId,
  ) async {
    await _api.deleteJson(
      '${_membersPath(wsId, groupId)}/${Uri.encodeComponent(contactId)}',
    );
    await _invalidateMembership(wsId);
  }

  Future<void> _invalidateMembership(String workspaceId) =>
      CacheStore.instance.invalidateTags(
        {'module:crm'},
        workspaceId: workspaceId,
        userId: expectedUserId,
      );
}
