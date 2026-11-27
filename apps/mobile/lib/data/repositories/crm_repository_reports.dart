part of 'crm_repository.dart';

mixin _CrmReportRepository {
  ApiClient get _api;

  Future<void> createReport(
    String wsId, {
    required String contactId,
    required String groupId,
    required String title,
    required String content,
    required String feedback,
    required Future<void> Function() beforeDispatch,
  }) async {
    await _api.postJsonGuarded('${CrmEndpoints.users(wsId)}/reports', {
      'user_id': contactId,
      'group_id': groupId,
      'title': title,
      'content': content,
      'feedback': feedback,
    }, beforeDispatch: beforeDispatch);
  }

  Future<void> updateReport(
    String wsId,
    String reportId, {
    required String title,
    required String content,
    required String feedback,
    required Future<void> Function() beforeDispatch,
  }) async {
    await _api.putJsonGuarded(
      '${CrmEndpoints.users(wsId)}/reports/${Uri.encodeComponent(reportId)}',
      {'title': title, 'content': content, 'feedback': feedback},
      beforeDispatch: beforeDispatch,
    );
  }
}
