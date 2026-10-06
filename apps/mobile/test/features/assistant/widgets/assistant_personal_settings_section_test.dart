import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets('$locale edits actual name and personality controls', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = [Locale(locale)];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      final repository = SettingsRepository();
      await tester.pumpApp(
        AssistantPersonalSettingsSection(
          workspaceId: 'workspace-a',
          isScopeCurrent: () => true,
          currentUserId: () => 'actor-a',
          repository: repository,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Mira'), findsOneWidget);
      expect(repository.writes, 0);
      await tester.tap(find.text(locale == 'en' ? 'Personality' : 'Tính cách'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, 'Nova');
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'Synthetic kind style',
      );
      final save = find.text(locale == 'en' ? 'Save' : 'Lưu');
      await tester.ensureVisible(save);
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(find.text('Nova'), findsOneWidget);
      expect(repository.writes, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets('deletion confirmation retains original on unconfirmed removal', (
    tester,
  ) async {
    final repository = SettingsRepository()
      ..remove = () => Future.error(StateError('synthetic'));
    await tester.pumpApp(
      AssistantPersonalSettingsSection(
        workspaceId: 'workspace-a',
        isScopeCurrent: () => true,
        currentUserId: () => 'actor-a',
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Memory'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic preference'), findsOneWidget);
    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Delete memory?'), findsOneWidget);
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    expect(find.text('Synthetic preference'), findsOneWidget);
    expect(
      find.text('Could not complete this change. Try again.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'explicit export rejects a late response after scope invalidation',
    (tester) async {
      var current = true;
      var shares = 0;
      final held = Completer<Map<String, dynamic>>();
      final repository = SettingsRepository()..export = () => held.future;
      await tester.pumpApp(
        AssistantPersonalSettingsSection(
          workspaceId: 'workspace-a',
          isScopeCurrent: () => current,
          currentUserId: () => 'actor-a',
          repository: repository,
          shareExport: (_) async {
            shares++;
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(shares, 0);
      await tester.tap(find.text('Memory'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Export memories'));
      await tester.pump();
      current = false;
      held.complete({
        'items': ['Synthetic preference'],
      });
      await tester.pumpAndSettle();
      expect(shares, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('large text and visible keyboard retain scrollable save action', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.8;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpApp(
      SingleChildScrollView(
        child: AssistantPersonalSettingsSection(
          workspaceId: 'workspace-a',
          isScopeCurrent: () => true,
          currentUserId: () => 'actor-a',
          repository: SettingsRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Personality'));
    await tester.pumpAndSettle();
    tester.view.viewInsets = const FakeViewPadding(bottom: 250);
    addTearDown(tester.view.resetViewInsets);
    await tester.tap(find.byType(TextFormField).first);
    await tester.pumpAndSettle();
    final save = find.text('Save');
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(save, findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('existing custom style stays selected and survives saving', (
    tester,
  ) async {
    AssistantSoul? saved;
    final repository = SettingsRepository()
      ..read = () async {
        return const AssistantPersonalSettingsSnapshot(
          soul: AssistantSoul(tone: 'gentle', chatTone: 'compact'),
          memoryEnabled: false,
          memories: [],
        );
      }
      ..write = (soul) async {
        saved = soul;
        return soul;
      };
    await tester.pumpApp(
      AssistantPersonalSettingsSection(
        workspaceId: 'workspace-a',
        isScopeCurrent: () => true,
        currentUserId: () => 'actor-a',
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Personality'));
    await tester.pumpAndSettle();
    expect(find.text('gentle'), findsOneWidget);
    expect(find.text('compact'), findsOneWidget);
    final save = find.text('Save');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(saved?.tone, 'gentle');
    expect(saved?.chatTone, 'compact');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
