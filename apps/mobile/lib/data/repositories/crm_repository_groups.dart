part of 'crm_repository.dart';

mixin _CrmGroupMembershipRepository {
  ApiClient get _api;
  String? get expectedUserId;

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
