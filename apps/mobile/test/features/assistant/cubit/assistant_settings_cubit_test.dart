import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mocktail/mocktail.dart';

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  late _Preferences preferences;
  late AssistantSettingsCubit settings;
  var current = true;
  setUpAll(() => registerFallbackValue(() => true));
  setUp(() {
    current = true;
    preferences = _Preferences();
    when(
      () => preferences.loadKeepLiveWhileBrowsing('ws'),
    ).thenAnswer((_) async => true);
    settings = AssistantSettingsCubit(
      workspaceId: 'ws',
      preferences: preferences,
      isScopeCurrent: () => current,
    );
  });
  tearDown(() async {
    await settings.close();
  });

  test(
    'loads actual preference and only publishes saved value after completion',
    () async {
      await settings.load();
      final done = Completer<void>();
      when(
        () => preferences.saveKeepLiveWhileBrowsing(
          'ws',
          value: false,
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) => done.future);
      final save = settings.save(value: false);
      expect(settings.state.keepLiveWhileBrowsing, isTrue);
      expect(settings.state.saving, isTrue);
      done.complete();
      await save;
      expect(settings.state.keepLiveWhileBrowsing, isFalse);
      expect(settings.state.saving, isFalse);
    },
  );

  test('failed save retains authorized value and allows retry', () async {
    await settings.load();
    when(
      () => preferences.saveKeepLiveWhileBrowsing(
        'ws',
        value: false,
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenThrow(StateError('Storage unavailable'));
    await settings.save(value: false);
    expect(settings.state.keepLiveWhileBrowsing, isTrue);
    expect(settings.state.failed, isTrue);
    expect(settings.state.loaded, isTrue);
    expect(settings.state.saving, isFalse);
  });

  test(
    'failed initial load cannot overwrite an unknown existing preference',
    () async {
      when(
        () => preferences.loadKeepLiveWhileBrowsing('ws'),
      ).thenThrow(StateError('Storage unavailable'));
      await settings.load();
      await settings.save(value: false);
      expect(settings.state.loaded, isFalse);
      verifyNever(
        () => preferences.saveKeepLiveWhileBrowsing(
          'ws',
          value: any(named: 'value'),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      );
    },
  );

  test(
    'scope invalidation fences delayed load even if workspace returns',
    () async {
      final pending = Completer<bool>();
      when(
        () => preferences.loadKeepLiveWhileBrowsing('ws'),
      ).thenAnswer((_) => pending.future);
      final load = settings.load();
      current = false;
      pending.complete(true);
      await load;
      expect(settings.state.loaded, isFalse);
      expect(settings.state.keepLiveWhileBrowsing, isFalse);
    },
  );

  test('scope invalidation prevents delayed preference dispatch', () async {
    await settings.load();
    final dispatch = Completer<void>();
    var wrote = false;
    when(
      () => preferences.saveKeepLiveWhileBrowsing(
        'ws',
        value: false,
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((invocation) async {
      await dispatch.future;
      final allowed =
          invocation.namedArguments[#shouldWrite] as bool Function();
      wrote = allowed();
    });
    final save = settings.save(value: false);
    current = false;
    dispatch.complete();
    await save;
    expect(wrote, isFalse);
    expect(settings.state.keepLiveWhileBrowsing, isTrue);
  });
}
