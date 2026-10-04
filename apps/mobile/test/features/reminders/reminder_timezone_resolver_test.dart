import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements TimezoneSettingsRepository {
  // Keep existing caller fixtures while the real repository owns coalescing.
  @override
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) => loadPersonal();
  @override
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) => loadWorkspace(id);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'default native loader revalidates NY to Paris without app restart',
    () async {
      const channel = MethodChannel('flutter_timezone');
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      var zone = 'America/New_York';
      messenger.setMockMethodCallHandler(channel, (_) async => zone);
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      final repository = _Repository();
      when(repository.loadPersonal).thenAnswer((_) async => 'auto');
      when(
        () => repository.loadWorkspace(any()),
      ).thenAnswer((_) async => 'auto');
      final resolver = ReminderTimezoneResolver(repository: repository);
      addTearDown(resolver.dispose);
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'ws'),
        'America/New_York',
      );
      zone = 'Europe/Paris';
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'ws'),
        'Europe/Paris',
      );
      when(repository.loadPersonal).thenAnswer((_) async => 'Asia/Ho_Chi_Minh');
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'ws'),
        'Asia/Ho_Chi_Minh',
      );
    },
  );

  late _Repository repository;
  late ReminderTimezoneResolver resolver;
  setUp(() {
    repository = _Repository();
    when(repository.loadPersonal).thenAnswer((_) async => 'auto');
    when(() => repository.loadWorkspace(any())).thenAnswer((_) async => 'auto');
    resolver = ReminderTimezoneResolver(
      repository: repository,
      deviceLoader: () async => 'Asia/Ho_Chi_Minh',
    );
    addTearDown(resolver.dispose);
  });

  test('personal preference overrides workspace and device', () async {
    when(repository.loadPersonal).thenAnswer((_) async => 'Europe/Paris');
    when(
      () => repository.loadWorkspace('ws'),
    ).thenAnswer((_) async => 'America/New_York');
    expect(
      await resolver.resolve(userId: 'user', workspaceId: 'ws'),
      'Europe/Paris',
    );
  });

  test('workspace preference overrides device when personal is auto', () async {
    when(
      () => repository.loadWorkspace('ws'),
    ).thenAnswer((_) async => 'America/New_York');
    expect(
      await resolver.resolve(userId: 'user', workspaceId: 'ws'),
      'America/New_York',
    );
  });

  test('auto preferences use the injected native device identifier', () async {
    expect(
      await resolver.resolve(userId: 'user', workspaceId: 'ws'),
      'Asia/Ho_Chi_Minh',
    );
  });

  test(
    'revalidates settings and retains resolved same-scope zone on failure',
    () async {
      when(repository.loadPersonal).thenAnswer((_) async => 'Europe/Paris');
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'ws'),
        'Europe/Paris',
      );
      when(
        repository.loadPersonal,
      ).thenAnswer((_) async => throw Exception('transient'));
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'ws'),
        'Europe/Paris',
      );
      verify(() => repository.loadWorkspace('ws')).called(2);
    },
  );

  test(
    'cold settings failure surfaces instead of assuming a device zone',
    () async {
      when(
        () => repository.loadWorkspace('ws'),
      ).thenAnswer((_) async => throw Exception('transient'));
      await expectLater(
        resolver.resolve(userId: 'user', workspaceId: 'ws'),
        throwsStateError,
      );
    },
  );

  test(
    'workspace failure never borrows another workspace resolution',
    () async {
      when(
        () => repository.loadWorkspace('first'),
      ).thenAnswer((_) async => 'Europe/Paris');
      expect(
        await resolver.resolve(userId: 'user', workspaceId: 'first'),
        'Europe/Paris',
      );
      when(
        () => repository.loadWorkspace('second'),
      ).thenAnswer((_) async => throw Exception('unavailable'));
      await expectLater(
        resolver.resolve(userId: 'user', workspaceId: 'second'),
        throwsStateError,
      );
    },
  );

  test(
    'account switch clears previously resolved workspace settings',
    () async {
      when(repository.loadPersonal).thenAnswer((_) async => 'Europe/Paris');
      await resolver.resolve(userId: 'first', workspaceId: 'ws');
      when(
        repository.loadPersonal,
      ).thenAnswer((_) async => throw Exception('unavailable'));
      await expectLater(
        resolver.resolve(userId: 'second', workspaceId: 'ws'),
        throwsStateError,
      );
    },
  );

  test(
    'delayed old-account resolution cannot replace the new account',
    () async {
      final old = Completer<String>();
      var calls = 0;
      when(repository.loadPersonal).thenAnswer(
        (_) => calls++ == 0 ? old.future : Future.value('Europe/Paris'),
      );
      final pending = resolver.resolve(userId: 'first', workspaceId: 'ws');
      final rejected = expectLater(pending, throwsStateError);
      expect(
        await resolver.resolve(userId: 'second', workspaceId: 'ws'),
        'Europe/Paris',
      );
      old.complete('America/New_York');
      await rejected;
      expect(
        await resolver.resolve(userId: 'second', workspaceId: 'ws'),
        'Europe/Paris',
      );
    },
  );

  test('logout invalidates an in-flight settings resolution', () async {
    final pending = Completer<String>();
    when(repository.loadPersonal).thenAnswer((_) => pending.future);
    final result = resolver.resolve(userId: 'user', workspaceId: 'ws');
    final rejected = expectLater(result, throwsStateError);
    resolver.clear();
    pending.complete('Europe/Paris');
    await rejected;
  });
}
