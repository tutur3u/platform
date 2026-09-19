import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/sources/api_client.dart';

class MeetCache {
  MeetCache({CacheStore? store, String? Function()? currentUserId})
    : _store = store ?? CacheStore.instance,
      _currentUserId = currentUserId ?? currentCacheUserId,
      _userId = (currentUserId ?? currentCacheUserId)();

  final CacheStore _store;
  final String? Function() _currentUserId;
  final String? _userId;
  bool get _usable => _userId != null && _userId == _currentUserId();

  CacheKey _key(String wsId, String path) => CacheKey(
    namespace: 'meet.list',
    userId: _userId,
    workspaceId: wsId,
    params: {'path': path},
  );

  Map<String, dynamic> _decode(Object? value) =>
      Map<String, dynamic>.from(value! as Map);

  MeetMeetingsPage? peek(String wsId, String path) {
    if (!_usable) return null;
    final result = _store.peek(key: _key(wsId, path), decode: _decode);
    return result.isExpired || result.data == null
        ? null
        : MeetMeetingsPage.fromJson(result.data!);
  }

  Future<Map<String, dynamic>> read(
    String wsId,
    String path,
    Future<Map<String, dynamic>> Function() fetch, {
    required bool forceRefresh,
  }) async {
    if (!_usable) return await fetch();
    try {
      await _store.init();
    } on Object {
      return await fetch();
    }
    try {
      final result = await _store.prefetch(
        key: _key(wsId, path),
        policy: const CachePolicy(
          staleAfter: Duration(minutes: 1),
          expireAfter: Duration(minutes: 20),
          allowBackgroundRefresh: false,
        ),
        decode: _decode,
        fetch: fetch,
        forceRefresh: forceRefresh,
        tags: ['meet'],
      );
      if (!result.hasValue || result.data == null) {
        throw StateError('Meet request was invalidated');
      }
      return result.data!;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _store.clearScope(
          userId: _userId,
          workspaceId: wsId,
          namespace: 'meet.list',
        );
      }
      rethrow;
    }
  }

  Future<void> invalidate(String wsId) async {
    if (!_usable) return;
    try {
      await _store.invalidateTags(['meet'], userId: _userId, workspaceId: wsId);
    } on Object {
      debugPrint('Meet cache invalidation unavailable');
    }
  }
}
