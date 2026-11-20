part of 'crm_repository.dart';

mixin _CrmApprovalRepository {
  ApiClient get _api;

  Future<List<ContactSectionRecord>> loadApprovals(String wsId) async {
    final records = <ContactSectionRecord>[];
    for (final kind in ContactApprovalKind.values) {
      try {
        records.addAll(
          contactApprovalRecords(
            await _api.getJson(CrmEndpoints.approvals(wsId, kind: kind.name)),
            kind: kind,
          ),
        );
      } on ApiException catch (error) {
        if (error.statusCode != 403) rethrow;
      }
    }
    return records;
  }

  Future<void> updateApproval(
    String wsId, {
    required String itemId,
    required ContactApprovalKind kind,
    required ContactApprovalDecision decision,
    String? reason,
  }) async {
    await _api.putJson('${CrmEndpoints.users(wsId)}/approvals', {
      'kind': kind.name,
      'action': decision.name,
      'itemId': itemId,
      if (reason != null) 'reason': reason,
    });
  }
}
