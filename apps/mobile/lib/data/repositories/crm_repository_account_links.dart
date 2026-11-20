part of 'crm_repository.dart';

mixin _CrmAccountLinkRepository {
  ApiClient get _api;

  Future<List<CrmLinkedUser>> getContactAccountChoices(
    String workspaceId,
  ) async {
    final result = await _api.getJson(
      WorkspaceSettingsEndpoints.members(Uri.encodeComponent(workspaceId)),
    );
    return (result['members'] as List)
        .cast<Map<String, dynamic>>()
        .where((row) => crmAsString(row['id']) != null)
        .map(
          (row) => CrmLinkedUser(
            id: crmAsString(row['id'])!,
            displayName: crmAsString(row['display_name']),
          ),
        )
        .toList(growable: false);
  }

  Future<Uri> inviteToContactAccountLink(
    String workspaceId,
    String contactId,
    String accountId,
  ) async {
    final users = CrmEndpoints.users(Uri.encodeComponent(workspaceId));
    final result = await _api.postJson('$users/links/repair', {
      'action': 'invite',
      'workspaceUserId': contactId,
      'platformAccountId': accountId,
    });
    final invitationId = crmAsString(result['invitationId']);
    if (result['outcome'] != 'invited' || invitationId == null) {
      throw const FormatException('Invalid account-link invitation result');
    }
    return Uri.parse(ApiConfig.baseUrl).replace(
      path: '/contact-link',
      queryParameters: {
        'wsId': workspaceId,
        'contactId': contactId,
        'invitationId': invitationId,
      },
    );
  }

  Future<void> revokeContactAccountLink(
    String workspaceId,
    String contactId,
  ) async {
    final users = CrmEndpoints.users(Uri.encodeComponent(workspaceId));
    await _api.postJson('$users/links/repair', {
      'action': 'revoke',
      'workspaceUserId': contactId,
    });
  }
}
