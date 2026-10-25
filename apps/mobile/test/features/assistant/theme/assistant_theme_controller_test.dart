import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'actor-global defaults survive reopening and remain actor isolated',
    () async {
      final actor = ValueNotifier<AssistantThemeActor?>(
        AssistantThemeActor('a'),
      );
      final controller = AssistantThemeController(actor: actor);
      final ocean = AssistantThemePreferences.preset(AppearanceThemeId.ocean);
      await controller.reload();
      expect(await controller.setValue(ocean), isTrue);
      controller.dispose();

      final reopened = AssistantThemeController(actor: actor);
      await reopened.reload();
      expect(reopened.value, ocean);
      actor.value = AssistantThemeActor('b');
      expect(reopened.value, const AssistantThemePreferences());
      await reopened.reload();
      expect(reopened.value, const AssistantThemePreferences());
      expect(await reopened.setValue(ocean.copyWith(intensity: 0.2)), isTrue);
      actor.value = AssistantThemeActor('a');
      await reopened.reload();
      expect(reopened.value, ocean);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), {
        'a::assistant-chat-theme::v1',
        'b::assistant-chat-theme::v1',
      });
      actor.value = null;
      expect(reopened.value, const AssistantThemePreferences());
      expect(await reopened.setValue(ocean), isFalse);
      reopened.dispose();
      actor.dispose();
    },
  );

  test('queued writes cannot cross logout and same-actor ABA', () async {
    final prefs = await SharedPreferences.getInstance();
    final gate = Completer<SharedPreferences>();
    var hold = false;
    final store = AssistantThemeStore(
      preferences: () => hold ? gate.future : Future.value(prefs),
    );
    final original = AssistantThemeActor('a');
    final actor = ValueNotifier<AssistantThemeActor?>(original);
    final controller = AssistantThemeController(actor: actor, store: store);
    await controller.reload();
    hold = true;
    final pending = controller.setValue(
      AssistantThemePreferences.preset(AppearanceThemeId.sunset),
    );
    // Even reusing the original snapshot cannot restore the retired epoch.
    actor
      ..value = null
      ..value = original;
    gate.complete(prefs);
    expect(await pending, isFalse);
    await controller.reload();
    expect(controller.value, const AssistantThemePreferences());
    expect(prefs.containsKey(AssistantThemeStore.keyFor('a')), isFalse);
    controller.dispose();
    actor.dispose();
  });

  test('a late old-actor load never publishes into the new actor', () async {
    final stored = AssistantThemePreferences.preset(AppearanceThemeId.aurora);
    SharedPreferences.setMockInitialValues({
      AssistantThemeStore.keyFor('a'): stored.encode(),
    });
    final gate = Completer<SharedPreferences>();
    final actor = ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
    final controller = AssistantThemeController(
      actor: actor,
      store: AssistantThemeStore(preferences: () => gate.future),
    );
    actor.value = AssistantThemeActor('b');
    gate.complete(await SharedPreferences.getInstance());
    await controller.reload();
    expect(controller.value, const AssistantThemePreferences());
    controller.dispose();
    actor.dispose();
  });

  test(
    'a picker callback captured before an actor transition is retired',
    () async {
      final actor = ValueNotifier<AssistantThemeActor?>(
        AssistantThemeActor('a'),
      );
      final controller = AssistantThemeController(actor: actor);
      await controller.reload();
      final oldPicker = controller.onChanged!;
      actor.value = AssistantThemeActor('b');
      await controller.reload();
      oldPicker(AssistantThemePreferences.preset(AppearanceThemeId.ocean));
      expect(controller.value, const AssistantThemePreferences());
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), isEmpty);
      controller.dispose();
      actor.dispose();
    },
  );

  test('newest edit wins and disposal saves a waiting write', () async {
    final prefs = await SharedPreferences.getInstance();
    final gate = Completer<SharedPreferences>();
    var hold = false;
    final actor = ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
    final controller = AssistantThemeController(
      actor: actor,
      store: AssistantThemeStore(
        preferences: () => hold ? gate.future : Future.value(prefs),
      ),
    );
    await controller.reload();
    hold = true;
    final older = controller.setValue(
      AssistantThemePreferences.preset(AppearanceThemeId.ocean),
    );
    final newer = controller.reset();
    gate.complete(prefs);
    expect(await older, isFalse);
    expect(await newer, isTrue);
    expect(
      AssistantThemePreferences.decode(
        prefs.getString(AssistantThemeStore.keyFor('a')),
      ),
      const AssistantThemePreferences(),
    );
    controller.dispose();

    final closingGate = Completer<SharedPreferences>();
    var closing = false;
    final closingController = AssistantThemeController(
      actor: actor,
      store: AssistantThemeStore(
        preferences: () => closing ? closingGate.future : Future.value(prefs),
      ),
    );
    await closingController.reload();
    closing = true;
    final pending = closingController.setValue(
      AssistantThemePreferences.preset(AppearanceThemeId.ember),
    );
    closingController.dispose();
    closingGate.complete(prefs);
    expect(await pending, isFalse);
    expect(
      AssistantThemePreferences.decode(
        prefs.getString(AssistantThemeStore.keyFor('a')),
      ),
      AssistantThemePreferences.preset(AppearanceThemeId.ember),
    );
    actor.dispose();
  });

  test(
    'storage errors retain the edit and retry persists that exact choice',
    () async {
      final prefs = await SharedPreferences.getInstance();
      var fail = false;
      final actor = ValueNotifier<AssistantThemeActor?>(
        AssistantThemeActor('a'),
      );
      final controller = AssistantThemeController(
        actor: actor,
        store: AssistantThemeStore(
          preferences: () async {
            if (fail) throw StateError('unavailable');
            return prefs;
          },
        ),
      );
      await controller.reload();
      fail = true;
      final value = AssistantThemePreferences.preset(AppearanceThemeId.forest);
      expect(await controller.setValue(value), isFalse);
      expect(controller.value, value);
      expect(controller.storageFailed, isTrue);
      fail = false;
      await controller.retry();
      expect(controller.storageFailed, isFalse);
      expect(prefs.getString(AssistantThemeStore.keyFor('a')), value.encode());
      controller.dispose();
      actor.dispose();
    },
  );

  test(
    'non-string stored values fall back without leaking another namespace',
    () async {
      SharedPreferences.setMockInitialValues({
        AssistantThemeStore.keyFor('a'): 123,
        AssistantThemeStore.keyFor('b'): AssistantThemePreferences.preset(
          AppearanceThemeId.ocean,
        ).encode(),
      });
      final actor = ValueNotifier<AssistantThemeActor?>(
        AssistantThemeActor('a'),
      );
      final controller = AssistantThemeController(actor: actor);
      await controller.reload();
      expect(controller.value, const AssistantThemePreferences());
      expect(controller.storageFailed, isFalse);
      controller.dispose();
      actor.dispose();
    },
  );
}
