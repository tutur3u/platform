part of 'crm_repository.dart';

mixin _CrmScheduleRepository {
  ApiClient get _api;

  Future<void> updateSessionOccurrence(
    String wsId, {
    required String actorId,
    required CrmSession session,
    required String title,
    required DateTime startsAt,
    required DateTime endsAt,
    required Future<void> Function() beforeDispatch,
  }) async {
    final name = title.trim();
    if (!session.isPersisted ||
        !endsAt.isAfter(startsAt) ||
        name.length > 255) {
      throw ArgumentError('Invalid session occurrence edit');
    }

    await ApiClient.runForUser(actorId, () async {
      await _api.putJsonGuarded(
        '${CrmEndpoints.userGroupSessions(wsId)}/${session.id}',
        {
          'scope': 'once',
          'title': name,
          'startsAt': startsAt.toUtc().toIso8601String(),
          'endsAt': endsAt.toUtc().toIso8601String(),
        },
        beforeDispatch: () async {
          await beforeDispatch();
          _api.checkUser(actorId);
        },
      );
    });
    await CacheStore.instance.invalidateTags(
      {'module:crm'},
      workspaceId: wsId,
      userId: actorId,
    );
  }
}
