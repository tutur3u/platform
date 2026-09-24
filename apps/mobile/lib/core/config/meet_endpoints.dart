/// Meet endpoint paths.
abstract final class MeetEndpoints {
  static String meetings(
    String wsId, {
    String? search,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (search != null && search.trim().isNotEmpty) {
      params['search'] = search.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/meetings$suffix';
  }

  static String meeting(String wsId, String meetingId) =>
      '/api/v1/workspaces/$wsId/meetings/$meetingId';

  static String realtimeToken(String wsId, String meetingId) =>
      '${meeting(wsId, meetingId)}/realtime-token';

  static String costs(String wsId, String meetingId) =>
      '${meeting(wsId, meetingId)}/costs';

  static String personalAssistant(String wsId, String meetingId) =>
      '${meeting(wsId, meetingId)}/assistant/personal';
}
