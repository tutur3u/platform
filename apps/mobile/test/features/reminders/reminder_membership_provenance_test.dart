import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

class _Notifications extends Mock implements PushNotificationService {}

class _Settings extends Mock implements SettingsRepository {}

// Only unrelated selection/default reads are isolated. Membership uses the
// actual repository, read-through helper and encrypted CacheStore.
class _Repository extends WorkspaceRepository {
  _Repository(_Api api, CacheStore store, {String? Function()? actor})
    : super(
        apiClient: api,
        cacheStore: store,
        cacheUserId: actor ?? () => 'user',
      );

  @override
  Future<Workspace?> getDefaultWorkspace() async => null;

  @override
  Future<String?> loadDefaultWorkspaceId() async => null;

  @override
  Future<Workspace?> loadSelectedWorkspace() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'reminders.user.tasksEnabled': false,
      'reminders.user.eventsEnabled': false,
      'reminders.user.scheduledIds': ['4242'],
    });
    directory = await Directory.systemTemp.createTemp('membership-provenance-');
    final storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
  });

  tearDown(() async {
    await CacheStore.instance.closeForTesting();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'account replacement rejects a delayed membership before caching',
    () async {
      final api = _Api();
      var actor = 'user';
      final repository = _Repository(api, store, actor: () => actor);
      final entered = Completer<void>();
      final response = Completer<List<dynamic>>();
      when(() => api.getJsonList('/api/v1/workspaces')).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      final request = repository.getWorkspaces();
      final rejected = expectLater(request, throwsStateError);
      await entered.future;
      actor = 'replacement';
      response.complete([
        {'id': 'private-workspace', 'name': 'Private'},
      ]);
      await rejected;
      expect((await repository.readCachedWorkspaces()).hasValue, isFalse);
      final original = await store.read<List<dynamic>>(
        key: const CacheKey(
          namespace: 'workspace.list',
          userId: 'user',
          workspaceId: 'personal',
          params: {'path': '/api/v1/workspaces'},
        ),
        decode: (payload) => List<dynamic>.from(payload! as List),
      );
      expect(original.hasValue, isFalse);
    },
  );

  for (final scenario in [
    'failed API',
    'cache invalidation',
    'verified empty',
  ]) {
    test('cached empty membership with $scenario protects ledger', () async {
      final api = _Api();
      when(
        () => api.getJson('/api/v1/workspaces/limits'),
      ).thenThrow(Exception('Synthetic limits unavailable'));
      final repository = _Repository(api, store);
      await repository.saveCachedWorkspaces([]);
      const remoteKey = CacheKey(
        namespace: 'workspace.list',
        userId: 'user',
        workspaceId: 'personal',
        params: {'path': '/api/v1/workspaces'},
      );
      await store.write(
        key: remoteKey,
        policy: CachePolicies.moduleData,
        payload: <dynamic>[],
      );
      final entered = Completer<void>();
      final response = Completer<List<dynamic>>();
      when(() => api.getJsonList('/api/v1/workspaces')).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      final workspace = WorkspaceCubit(workspaceRepository: repository);
      final notifications = _Notifications();
      final settings = _Settings();
      final pending = <int>{4242};
      when(
        notifications.pendingLocalReminderIds,
      ).thenAnswer((_) async => pending);
      when(
        () => notifications.notificationsEnabled,
      ).thenAnswer((_) async => true);
      when(settings.getLocale).thenAnswer((_) async => 'en');
      when(() => notifications.cancelLocalReminder(any())).thenAnswer((call) {
        pending.remove(call.positionalArguments.first as int);
        return Future<void>.value();
      });
      final service = ReminderService(
        notifications: notifications,
        settingsRepository: settings,
      );
      addTearDown(service.dispose);
      addTearDown(workspace.close);
      final load = workspace.loadWorkspaces();
      await entered.future;
      // Cached UI remains available, but is not server membership evidence.
      expect(workspace.state.workspaces, isEmpty);
      if (scenario == 'failed API') {
        response.completeError(
          const ApiException(message: 'Synthetic offline', statusCode: 503),
        );
      } else {
        if (scenario == 'cache invalidation') {
          await store.clearScope(userId: 'user');
        }
        response.complete([]);
      }
      await load;
      final verified = scenario == 'verified empty';
      await service.startWorkspaceSession('user', workspace.state);
      await service.refreshIfStale();
      expect(pending, verified ? isEmpty : equals({4242}));
      expect(workspace.state.emptyMembershipConfirmed, verified);
      final preferences = await SharedPreferences.getInstance();
      if (!verified) {
        expect(preferences.getStringList('reminders.user.scheduledIds'), [
          '4242',
        ]);
        verifyNever(() => notifications.cancelLocalReminder(any()));
      } else {
        verify(() => notifications.cancelLocalReminder(4242)).called(1);
      }
      verify(() => api.getJsonList('/api/v1/workspaces')).called(1);
    });
  }
}
