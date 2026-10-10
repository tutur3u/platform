import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/settings/view/settings_route_frame.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

Future<void> openPersonality(
  WidgetTester tester,
  SettingsRepository repository,
) async {
  await tester.pumpApp(
    SingleChildScrollView(
      child: AssistantPersonalSettingsSection(
        workspaceId: 'workspace-a',
        isScopeCurrent: () => true,
        currentUserId: () => 'actor-a',
        repository: repository,
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byType(ListTile).first);
  await tester.pumpAndSettle();
}

void expectChrome() {
  expect(find.byType(SettingsRouteFrame), findsOneWidget);
  expect(find.byType(MobileSectionAppBar), findsOneWidget);
  expect(find.byType(ShellDockActionButton), findsOneWidget);
  expect(find.byType(AppBar), findsNothing);
}

void main() {
  testWidgets('actual personality entry opens a dedicated settings route', (
    tester,
  ) async {
    await openPersonality(tester, SettingsRepository());
    expectChrome();
    expect(find.byType(TextFormField), findsNothing);
    expect(find.byType(ListTile), findsNWidgets(5));
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final language in ['en', 'vi']) {
    testWidgets(
      '$language dedicated per-setting saves preserve all other values',
      (tester) async {
        tester.platformDispatcher.localesTestValue = [Locale(language)];
        addTearDown(tester.platformDispatcher.clearLocalesTestValue);
        var expected = const AssistantSoul(
          name: 'Original',
          tone: 'gentle',
          chatTone: 'compact',
          personality: 'Original style',
          boundaries: 'Original boundaries',
          vibe: 'preserved vibe',
          pushTone: 'preserved push',
        );
        final repository = SettingsRepository()
          ..read = () async => AssistantPersonalSettingsSnapshot(
            soul: expected,
            memoryEnabled: false,
            memories: const [],
          );
        AssistantSoul? submitted;
        repository.write = (soul) async {
          submitted = soul;
          return soul;
        };
        await openPersonality(tester, repository);
        final replacements = {
          AssistantPersonalityField.name: 'Nova',
          AssistantPersonalityField.tone: 'warm',
          AssistantPersonalityField.verbosity: 'concise',
          AssistantPersonalityField.personality: 'Updated style',
          AssistantPersonalityField.boundaries: 'Updated boundaries',
        };
        for (final entry in replacements.entries) {
          final row = find.byKey(
            ValueKey('assistant-personality-${entry.key.name}'),
          );
          await tester.ensureVisible(row);
          await tester.tap(row);
          await tester.pumpAndSettle();
          expectChrome();
          if (entry.key
              .options(
                tester.element(find.byType(AssistantPersonalityFieldEditor)),
              )
              .isEmpty) {
            await tester.enterText(find.byType(TextFormField), entry.value);
          } else {
            final dropdown = find.byType(DropdownButtonFormField<String>);
            await tester.tap(dropdown);
            await tester.pumpAndSettle();
            final label = entry.key.options(
              tester.element(dropdown),
            )[entry.value]!;
            await tester.tap(find.text(label).last);
            await tester.pumpAndSettle();
          }
          final save = find.widgetWithText(
            FilledButton,
            language == 'en' ? 'Save' : 'Lưu',
          );
          await tester.ensureVisible(save);
          await tester.tap(save);
          await tester.pumpAndSettle();
          expected = entry.key.update(expected, entry.value);
          expect(submitted, expected);
          expect(find.byType(AssistantPersonalityFieldEditor), findsNothing);
          expectChrome();
        }
        expect(repository.writes, 5);
        await tester.tap(find.byType(ShellDockActionButton));
        await tester.pumpAndSettle();
        expect(find.text('Nova'), findsOneWidget);
        // Re-entry shows confirmed settings.
        await tester.tap(
          find.text(language == 'en' ? 'Personality' : 'Tính cách'),
        );
        await tester.pumpAndSettle();
        expect(find.text('Updated style'), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  for (final editor in ['name', 'memory']) {
    for (final back in ['dock', 'system']) {
      testWidgets('$editor route has keyboard-safe content and $back back '
          'at 320px/2x', (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final repository = SettingsRepository();
        await openPersonality(tester, repository);
        if (editor == 'name') {
          await tester.tap(
            find.byKey(const ValueKey('assistant-personality-name')),
          );
        } else {
          await tester.tap(find.byType(ShellDockActionButton));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Memory'));
          await tester.pumpAndSettle();
          final row = find.text('Synthetic preference');
          await tester.ensureVisible(row);
          await tester.tap(row);
        }
        await tester.pumpAndSettle();
        tester.view.viewInsets = const FakeViewPadding(bottom: 240);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpAndSettle();
        final save = find.widgetWithText(FilledButton, 'Save');
        await tester.ensureVisible(save);
        await tester.pumpAndSettle();
        expectChrome();
        final dock = tester.getRect(find.byType(ShellDockActionButton));
        expect(dock.bottom, lessThanOrEqualTo(400));
        expect(tester.getRect(save).bottom, lessThanOrEqualTo(dock.top));
        expect(save.hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        if (back == 'dock') {
          await tester.tap(find.byType(ShellDockActionButton));
        } else {
          await tester.binding.handlePopRoute();
        }
        await tester.pumpAndSettle();
        expect(find.byType(TextFormField), findsNothing);
        expect(repository.writes, 0);
        expect(repository.edits, 0);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets(
    'failed per-setting save retains draft and retries explicit change',
    (tester) async {
      final repository = SettingsRepository()
        ..write = (_) => Future.error(StateError('Synthetic failure'));
      await openPersonality(tester, repository);
      await tester.tap(
        find.byKey(const ValueKey('assistant-personality-name')),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), 'Unsaved Nova');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
            .controller!
            .text,
        'Unsaved Nova',
      );
      expect(
        find.text('Could not complete this change. Try again.'),
        findsOneWidget,
      );
      repository.write = (soul) async => soul;
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved Nova'), findsOneWidget);
      expect(repository.writes, 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('covered personality save confirms without popping another route '
      'or resubmitting', (tester) async {
    final held = Completer<AssistantSoul>();
    final repository = SettingsRepository()..write = (_) => held.future;
    await openPersonality(tester, repository);
    await tester.tap(find.byKey(const ValueKey('assistant-personality-name')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Confirmed Nova');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pump();
    final navigator = Navigator.of(
      tester.element(find.byType(AssistantPersonalityFieldEditor)),
    );
    unawaited(
      navigator.push<void>(
        MaterialPageRoute<void>(
          builder: (_) =>
              const Material(child: Text('Unrelated covering route')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    held.complete(const AssistantSoul(name: 'Confirmed Nova'));
    await tester.pumpAndSettle();
    expect(find.text('Unrelated covering route'), findsOneWidget);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilledButton, 'Done'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Done'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmed Nova'), findsOneWidget);
    expect(repository.writes, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
