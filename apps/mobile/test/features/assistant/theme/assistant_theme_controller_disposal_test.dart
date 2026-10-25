import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final (label, value) in [
    ('preset', AssistantThemePreferences.preset(AppearanceThemeId.ocean)),
    (
      'select',
      const AssistantThemePreferences(textAccent: AppearanceAccentId.amber),
    ),
  ]) {
    testWidgets('closing saves the last $label before debounce', (
      tester,
    ) async {
      final fixture = await _Fixture.create();
      final change = fixture.controller.onChanged!;
      final release = fixture.controller.onChangeEnd!;
      change(value.copyWith(intensity: 0.2));
      change(value);
      await tester.pump(const Duration(milliseconds: 299));
      expect(fixture.store.writes, isEmpty);

      fixture.controller.dispose();
      final notifications = fixture.notifications;
      change(value.copyWith(intensity: 0.9));
      release();
      expect(await fixture.controller.setValue(value), isFalse);
      await tester.pump(const Duration(seconds: 1));
      await fixture.controller.writesDrained;
      fixture.actor.dispose();

      expect(fixture.stored(), value);
      expect(fixture.store.writes, [value]);
      expect(fixture.notifications, notifications);
      expect(fixture.controller.onChanged, isNull);
      expect(fixture.controller.onChangeEnd, isNull);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a reset queued just before closing replaces the stored preset', (
    tester,
  ) async {
    final fixture = await _Fixture.create();
    final preset = AssistantThemePreferences.preset(AppearanceThemeId.ember);
    expect(await fixture.controller.setValue(preset), isTrue);
    final gate = fixture.holdPreferences();
    final reset = fixture.controller.reset();
    await tester.pump();
    expect(gate.entered, isTrue);
    fixture.controller.dispose();
    final notifications = fixture.notifications;
    gate.release(fixture.preferences);
    expect(await reset, isFalse);
    await tester.pump();
    await fixture.controller.writesDrained;
    fixture.actor.dispose();

    expect(fixture.stored(), const AssistantThemePreferences());
    expect(fixture.store.writes, [preset, const AssistantThemePreferences()]);
    expect(fixture.notifications, notifications);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held write drains once after closing without notifications', (
    tester,
  ) async {
    final fixture = await _Fixture.create();
    final value = AssistantThemePreferences.preset(AppearanceThemeId.sunset);
    final gate = fixture.holdPreferences();
    final pending = fixture.controller.setValue(value);
    await tester.pump();
    expect(gate.entered, isTrue);
    fixture.controller.dispose();
    final notifications = fixture.notifications;
    gate.release(fixture.preferences);
    expect(await pending, isFalse);
    await tester.pump(const Duration(seconds: 1));

    expect(fixture.stored(), value);
    expect(fixture.store.writes, [value]);
    expect(fixture.notifications, notifications);
    fixture.actor.dispose();
  });

  testWidgets('closing queues the newest preview behind a held older write', (
    tester,
  ) async {
    final fixture = await _Fixture.create();
    final older = AssistantThemePreferences.preset(AppearanceThemeId.ocean);
    final latest = AssistantThemePreferences.preset(AppearanceThemeId.aurora);
    final gate = fixture.holdPreferences();
    final pending = fixture.controller.setValue(older);
    await tester.pump();
    expect(gate.entered, isTrue);
    fixture.controller.onChanged!(latest);
    fixture.controller.dispose();
    final notifications = fixture.notifications;
    gate.release(fixture.preferences);
    expect(await pending, isFalse);
    await tester.pump(const Duration(seconds: 1));

    expect(fixture.stored(), latest);
    expect(fixture.store.writes, [latest]);
    expect(fixture.notifications, notifications);
    fixture.actor.dispose();
  });

  for (final transition in ['account', 'logout', 'same actor', 'ABA']) {
    for (final afterDisposal in [false, true]) {
      testWidgets(
        '$transition discards pending edits with disposal first=$afterDisposal',
        (tester) async {
          final fixture = await _Fixture.create();
          final original = fixture.actor.value!;
          final value = AssistantThemePreferences.preset(
            AppearanceThemeId.ocean,
          );
          final gate = fixture.holdPreferences();
          fixture.controller.onChanged!(value);
          if (afterDisposal) {
            fixture.controller.dispose();
            await tester.pump();
            expect(gate.entered, isTrue);
          }
          switch (transition) {
            case 'account':
              fixture.actor.value = AssistantThemeActor('b');
            case 'logout':
              fixture.actor.value = null;
            case 'same actor':
              fixture.actor.value = AssistantThemeActor('a');
            case 'ABA':
              fixture.actor
                ..value = null
                ..value = original;
          }
          if (!afterDisposal) fixture.controller.dispose();
          final notifications = fixture.notifications;
          gate.release(fixture.preferences);
          await tester.pump(const Duration(seconds: 1));

          expect(fixture.preferences.getKeys(), isEmpty);
          expect(fixture.store.writes, isEmpty);
          expect(fixture.notifications, notifications);
          expect(tester.takeException(), isNull);
          fixture.actor.dispose();
        },
      );
    }
  }

  for (final sameSource in [false, true]) {
    testWidgets(
      'close and reopen preserves the held edit with shared source=$sameSource',
      (tester) async {
        final fixture = await _Fixture.create();
        final older = AssistantThemePreferences.preset(AppearanceThemeId.ocean);
        final newer = AssistantThemePreferences.preset(
          AppearanceThemeId.forest,
        );
        final gate = fixture.holdPreferences();
        fixture.controller.onChanged!(older);
        fixture.controller.dispose();
        await tester.pump();
        expect(gate.entered, isTrue);
        final replacementActor = sameSource
            ? fixture.actor
            : ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
        final replacement = AssistantThemeController(
          actor: replacementActor,
          store: fixture.store,
        );
        gate.release(fixture.preferences);
        await replacement.reload();
        expect(replacement.value, older);
        expect(fixture.store.writes, [older]);
        expect(await replacement.setValue(newer), isTrue);
        await tester.pump(const Duration(seconds: 1));

        expect(fixture.stored(), newer);
        expect(fixture.store.writes, [older, newer]);
        replacement.dispose();
        if (!sameSource) replacementActor.dispose();
        fixture.actor.dispose();
      },
    );
  }

  testWidgets('a disposed failed write is contained and never notifies', (
    tester,
  ) async {
    final fixture = await _Fixture.create();
    final value = AssistantThemePreferences.preset(AppearanceThemeId.ocean);
    final gate = fixture.holdPreferences();
    fixture.controller.onChanged!(value);
    fixture.controller.dispose();
    await tester.pump();
    expect(gate.entered, isTrue);
    final notifications = fixture.notifications;
    gate.fail();
    await tester.pump(const Duration(seconds: 1));

    expect(fixture.preferences.getKeys(), isEmpty);
    expect(fixture.notifications, notifications);
    expect(tester.takeException(), isNull);
    fixture.actor.dispose();
  });

  testWidgets('disposal of a held reload neither writes nor publishes', (
    tester,
  ) async {
    final fixture = await _Fixture.create();
    final gate = fixture.holdPreferences();
    final loading = fixture.controller.reload();
    await tester.pump();
    expect(gate.entered, isTrue);
    fixture.controller.dispose();
    fixture.actor.dispose();
    final notifications = fixture.notifications;
    gate.release(fixture.preferences);
    await loading;

    expect(fixture.store.writes, isEmpty);
    expect(fixture.notifications, notifications);
    expect(tester.takeException(), isNull);
  });
}

class _Fixture {
  _Fixture(this.preferences) {
    store = _RecordingStore(
      preferences: () {
        final held = _held;
        if (held == null) return Future.value(preferences);
        held.entered = true;
        return held.future;
      },
    );
    controller = AssistantThemeController(actor: actor, store: store);
    controller.addListener(() => notifications++);
  }

  static Future<_Fixture> create() async {
    final fixture = _Fixture(await SharedPreferences.getInstance());
    await fixture.controller.reload();
    return fixture;
  }

  final SharedPreferences preferences;
  final actor = ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
  late final _RecordingStore store;
  late final AssistantThemeController controller;
  _PreferencesGate? _held;
  int notifications = 0;

  _PreferencesGate holdPreferences() => _held = _PreferencesGate();

  AssistantThemePreferences stored() => AssistantThemePreferences.decode(
    preferences.getString(AssistantThemeStore.keyFor('a')),
  );
}

class _PreferencesGate {
  final _completer = Completer<SharedPreferences>();
  bool entered = false;
  Future<SharedPreferences> get future => _completer.future;

  void release(SharedPreferences preferences) =>
      _completer.complete(preferences);
  void fail() => _completer.completeError(StateError('storage unavailable'));
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
