part of 'crm_repository.dart';

mixin _CrmAttendanceRepository {
  ApiClient get _api;

  /// A contact's attendance for [month] across every group they belong to,
  /// oldest first. The platform requires `check_user_attendance`.
  Future<List<CrmMemberAttendance>> getMemberAttendance(
    String workspaceId,
    String contactId, {
    required DateTime month,
  }) async {
    final key =
        '${month.year.toString().padLeft(4, '0')}-'
        '${month.month.toString().padLeft(2, '0')}';
    final contact = CrmEndpoints.user(
      Uri.encodeComponent(workspaceId),
      Uri.encodeComponent(contactId),
    );
    final result = await _api.getJson('$contact/attendance?month=$key');
    final rows = result['attendance'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map<String, dynamic>>()
        .map(CrmMemberAttendance.fromJson)
        .where((record) => record.date.year > 0)
        .toList()
      ..sort((a, b) => a.date.compareTo(b.date));
  }
}
