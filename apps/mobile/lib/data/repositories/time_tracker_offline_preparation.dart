import 'dart:convert';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';

import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/history_period.dart';

class TimeTrackerOfflinePreparation {
  TimeTrackerOfflinePreparation({
    required this.api,
    this.store,
    this.currentUser,
    this.firstDayOfWeek = DateTime.monday,
  });
  final int firstDayOfWeek;
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('time_tracker');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadTimeTracker)) {
      registry.register(
        'time_tracker',
        MobileFlag.offlineReadTimeTracker,
        prepare,
      );
    }
  }

  Future<void> prepare(String workspaceId) async {
    final owner = currentUser ?? currentCacheUserId;
    final user = owner();
    if (user == null) throw const OfflinePreparationUnavailable();
    final manifest = OfflineDownloadManifest(
      store ?? CacheStore.instance,
      user,
      owner,
    );
    final pending =
        <({String namespace, String path, Map<String, dynamic> data})>[];
    var bytes = 0;
    Future<Map<String, dynamic>> read(String namespace, String path) async {
      manifest.checkScope();
      api.checkUser(user);
      final data = await ApiClient.runForUser(user, () => api.getJson(path));
      manifest.checkScope();
      api.checkUser(user);
      bytes += utf8.encode(jsonEncode(data)).length;
      void checkLists(Object? value) {
        if (value is List) {
          if (value.length > maxItems) {
            throw const OfflinePreparationUnavailable();
          }
          value.forEach(checkLists);
        } else if (value is Map) {
          value.values.forEach(checkLists);
        }
      }

      if (bytes > maxBytes) throw const OfflinePreparationUnavailable();
      checkLists(data);
      final sessions = data['sessions'];
      final limit = Uri.parse(path).queryParameters['limit'];
      if (sessions is List &&
          limit != null &&
          sessions.length > int.parse(limit)) {
        throw const OfflinePreparationUnavailable();
      }
      pending.add((namespace: namespace, path: path, data: data));
      return data;
    }

    final periodRange = timeTrackerHistoryPeriod(
      HistoryViewMode.week,
      DateTime.now(),
      firstDayOfWeek: firstDayOfWeek,
    );
    final timezone = await getCurrentTimezoneIdentifier();
    final base = '/api/v1/workspaces/$workspaceId';
    String query(String path, Map<String, String> params) =>
        '$path?${Uri(queryParameters: params).query}';
    Future<Map<String, dynamic>> fetch(String path) =>
        read('time_tracker.data', path);
    await fetch('$base/time-tracking/categories');
    final running = await fetch('$base/time-tracking/sessions?type=running');
    final session = running['session'];
    if (session is Map && session['id'] is String) {
      final id = Uri.encodeComponent(session['id'] as String);
      await fetch('$base/time-tracking/sessions/$id/breaks/active');
    }
    await fetch('$base/time-tracking/sessions?type=paused');
    await fetch('$base/time-tracking/sessions?type=recent&limit=5');
    await fetch(
      query('$base/time-tracker/stats', {
        'userId': user,
        'isPersonal': 'false',
        'timezone': timezone,
      }),
    );
    final period = {
      'dateFrom': periodRange.start.toUtc().toIso8601String(),
      'dateTo': periodRange.end.toUtc().toIso8601String(),
      'userId': user,
    };
    await fetch(
      query('$base/time-tracking/sessions', {
        'type': 'history',
        'limit': '10',
        ...period,
      }),
    );
    await fetch(
      query('$base/time-tracking/stats/period', {
        ...period,
        'timezone': timezone,
      }),
    );
    await fetch('$base/settings');
    // Publish only after every response passes the aggregate budget.
    for (final entry in pending) {
      await manifest.save(
        CacheKey(
          namespace: entry.namespace,
          userId: user,
          workspaceId: workspaceId,
          params: {'path': entry.path},
        ),
        entry.data,
      );
    }
    await manifest.verify();
    manifest.retain('time_tracker', workspaceId);
  }
}
