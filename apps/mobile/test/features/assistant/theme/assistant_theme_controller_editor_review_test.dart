import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('two ticks before rebuild preview and persist the last choice', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.dispose);
    await fixture.controller.reload();
    final change = fixture.controller.onChanged!;
    change(_choice(0.2));
    change(_choice(0.9));
    expect(fixture.controller.value, _choice(0.9));
    expect(fixture.controller.saving, isTrue);
    expect(fixture.store.writes, isEmpty);
    await tester.pump(const Duration(milliseconds: 299));
    expect(fixture.store.writes, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    expect(fixture.store.writes, [_choice(0.9)]);
    expect(fixture.controller.saving, isFalse);
    expect(await fixture.stored(), _choice(0.9));
  });

  testWidgets('continuous frames coalesce writes until the quiet period', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.dispose);
    await fixture.controller.reload();
    final change = fixture.controller.onChanged!;
    for (var frame = 0; frame < 20; frame++) {
      change(_choice(0.2));
      change(_choice(0.8));
      await tester.pump(const Duration(milliseconds: 16));
      expect(fixture.controller.value, _choice(0.8));
      expect(fixture.store.writes, isEmpty);
    }
    await tester.pump(const Duration(milliseconds: 280));
    expect(fixture.store.writes, isEmpty);
    await tester.pump(const Duration(milliseconds: 4));
    expect(fixture.store.writes, [_choice(0.8)]);
    await tester.pump(const Duration(seconds: 1));
    expect(fixture.store.writes, hasLength(1));
  });

  testWidgets('release saves the last preview without a timer echo', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.dispose);
    await fixture.controller.reload();
    final change = fixture.controller.onChanged!;
    final release = fixture.controller.onChangeEnd!;
    change(_choice(0.2));
    change(_choice(0.9));
    release();
    await tester.pump();
    expect(fixture.store.writes, [_choice(0.9)]);
    expect(await fixture.stored(), _choice(0.9));
    release();
    await tester.pump(const Duration(seconds: 1));
    expect(fixture.store.writes, hasLength(1));
  });

  for (final transition in [
    'account switch',
    'same actor session',
    'logout ABA',
  ]) {
    testWidgets('stale change and release are fenced after $transition', (
      tester,
    ) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      await fixture.controller.reload();
      final original = fixture.actor.value!;
      final change = fixture.controller.onChanged!;
      final release = fixture.controller.onChangeEnd!;
      change(_choice(0.2));
      switch (transition) {
        case 'account switch':
          fixture.actor.value = AssistantThemeActor('b');
        case 'same actor session':
          fixture.actor.value = AssistantThemeActor('a');
        case 'logout ABA':
          fixture.actor
            ..value = null
            ..value = original;
      }
      await fixture.controller.reload();
      fixture.controller.onChanged!(_choice(0.4));
      change(_choice(0.9));
      release();
      expect(fixture.controller.value, _choice(0.4));
      await tester.pump();
      expect(fixture.store.writes, isEmpty);
      await tester.pump(const Duration(milliseconds: 300));
      expect(fixture.store.writes, [_choice(0.4)]);
      expect(await fixture.stored(), _choice(0.4));
      if (transition == 'account switch') {
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.containsKey(AssistantThemeStore.keyFor('a')), isFalse);
      }
    });
  }

  testWidgets('logout cancels a pending debounce without storage or preview', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.dispose);
    await fixture.controller.reload();
    final change = fixture.controller.onChanged!;
    final release = fixture.controller.onChangeEnd!;
    change(_choice(0.9));
    fixture.actor.value = null;
    change(_choice(0.2));
    release();
    await tester.pump(const Duration(seconds: 1));
    expect(fixture.controller.value, const AssistantThemePreferences());
    expect(fixture.controller.onChanged, isNull);
    expect(fixture.controller.onChangeEnd, isNull);
    expect(fixture.controller.saving, isFalse);
    expect(fixture.store.writes, isEmpty);
    expect(await fixture.stored(), const AssistantThemePreferences());
  });

  testWidgets('disposal saves debounce and retires captured callbacks', (
    tester,
  ) async {
    final fixture = _Fixture();
    await fixture.controller.reload();
    final change = fixture.controller.onChanged!;
    final release = fixture.controller.onChangeEnd!;
    change(_choice(0.9));
    fixture.dispose();
    change(_choice(0.2));
    release();
    await tester.pump(const Duration(seconds: 1));
    expect(fixture.store.writes, [_choice(0.9)]);
    expect(await fixture.stored(), _choice(0.9));
  });

  testWidgets('failed debounce retains the last preview for retry', (
    tester,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    var fail = false;
    final fixture = _Fixture(
      store: _RecordingStore(
        preferences: () async {
          if (fail) throw StateError('unavailable');
          return prefs;
        },
      ),
    );
    addTearDown(fixture.dispose);
    await fixture.controller.reload();
    fail = true;
    fixture.controller.onChanged!(_choice(0.9));
    await tester.pump(const Duration(milliseconds: 300));
    expect(fixture.controller.value, _choice(0.9));
    expect(fixture.controller.storageFailed, isTrue);
    expect(fixture.controller.saving, isFalse);
    expect(fixture.store.writes, isEmpty);
    fail = false;
    await fixture.controller.retry();
    expect(fixture.controller.storageFailed, isFalse);
    expect(await fixture.stored(), _choice(0.9));
    expect(fixture.store.writes, [_choice(0.9)]);
  });
}

AssistantThemePreferences _choice(double intensity) =>
    AssistantThemePreferences(
      backgroundStyle: AssistantBackgroundStyle.gradient,
      intensity: intensity,
    );

class _Fixture {
  _Fixture({_RecordingStore? store}) : store = store ?? _RecordingStore() {
    controller = AssistantThemeController(actor: actor, store: this.store);
  }

  final actor = ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
  final _RecordingStore store;
  late final AssistantThemeController controller;

  Future<AssistantThemePreferences> stored() async {
    final prefs = await SharedPreferences.getInstance();
    return AssistantThemePreferences.decode(
      prefs.getString(AssistantThemeStore.keyFor(actor.value?.actorId ?? 'a')),
    );
  }

  void dispose() {
    controller.dispose();
    actor.dispose();
  }
}

class _RecordingStore extends AssistantThemeStore {
  _RecordingStore({super.preferences});

  final writes = <AssistantThemePreferences>[];

  @override
  Future<bool> write(
    String actorId,
    AssistantThemePreferences value, {
    required bool Function() isCurrent,
  }) async {
    final saved = await super.write(actorId, value, isCurrent: isCurrent);
    if (saved) writes.add(value);
    return saved;
  }
}
