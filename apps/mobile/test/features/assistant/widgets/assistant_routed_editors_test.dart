import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_settings_editor_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_editor.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

class _Shell extends StatelessWidget {
  const _Shell({required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: FloatingShellDock(
      location: location,
      bottomInset: 80,
      navigationWidth: 104,
      keyboardVisible: MediaQuery.viewInsetsOf(context).bottom > 0,
      header: BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
        builder: (_, state) =>
            MobileSectionAppBar(title: state.resolveForLocation(location)),
      ),
      navigation: BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
        builder: (context, state) => ShellDockActionButton(
          primary: false,
          action: ShellActionSpec(
            id: 'test-dock-back',
            icon: Icons.chevron_left,
            tooltip: context.l10n.navBack,
            onPressed: () => unawaited(state.backForLocation(location)?.call()),
          ),
        ),
      ),
      child: child,
    ),
  );
}

Future<void> openPersonality(
  WidgetTester tester,
  SettingsRepository repository,
) async {
  final chrome = ShellChromeActionsCubit();
  final titles = ShellTitleOverrideCubit();
  final nav = ShellMiniNavCubit();
  final router = GoRouter(
    initialLocation: '/test',
    routes: [
      ShellRoute(
        builder: (_, state, child) =>
            _Shell(location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: '/test',
            builder: (context, _) => AssistantSettingsEditorPage(
              title: context.l10n.assistantSettingsTitle,
              child: SingleChildScrollView(
                child: AssistantPersonalSettingsSection(
                  workspaceId: 'workspace-a',
                  isScopeCurrent: () => true,
                  currentUserId: () => 'actor-a',
                  repository: repository,
                ),
              ),
            ),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  addTearDown(chrome.close);
  addTearDown(titles.close);
  addTearDown(nav.close);
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider.value(value: chrome),
        BlocProvider.value(value: titles),
        BlocProvider.value(value: nav),
      ],
      child: shellTestApp(router: router),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(
    find.byKey(const ValueKey('assistant-settings-personality')),
  );
  await tester.pumpAndSettle();
}

void expectChrome({String backLabel = 'Back'}) {
  expect(find.byType(AppSheetScaffold), findsNothing);
  expect(find.byKey(const ValueKey('app-sheet-close')), findsNothing);
  expect(find.byType(MobileSectionAppBar), findsOneWidget);
  expect(find.byType(PersistentShellDock), findsOneWidget);
  expect(find.byTooltip(backLabel).hitTestable(), findsOneWidget);
  expect(find.byType(AppBar), findsNothing);
  expect(
    find.descendant(
      of: find.byType(MobileSectionAppBar),
      matching: find.byTooltip(backLabel),
    ),
    findsNothing,
  );
}

void main() {
  testWidgets('actual personality entry opens a routed settings editor', (
    tester,
  ) async {
    await openPersonality(tester, SettingsRepository());
    expectChrome();
    expect(find.byType(AppTextFormField), findsNothing);
    expect(
      find.descendant(
        of: find.byType(AssistantPersonalityEditor),
        matching: find.byType(AppGroupedRow),
      ),
      findsNWidgets(5),
    );
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
          expectChrome(backLabel: language == 'en' ? 'Back' : 'Quay lại');
          if (entry.key
              .options(
                tester.element(find.byType(AssistantPersonalityFieldEditor)),
              )
              .isEmpty) {
            await tester.enterText(find.byType(AppTextFormField), entry.value);
          } else {
            final dropdown = find.byType(AppSelect<String>);
            await tester.tap(dropdown);
            await tester.pumpAndSettle();
            final label = entry.key.options(
              tester.element(dropdown),
            )[entry.value]!;
            await tester.tap(find.text(label).last);
            await tester.pumpAndSettle();
          }
          final save = find.byTooltip(language == 'en' ? 'Save' : 'Lưu');
          expect(
            find.widgetWithText(AppButton, language == 'en' ? 'Save' : 'Lưu'),
            findsNothing,
          );
          await tester.ensureVisible(save);
          await tester.tap(save);
          await tester.pumpAndSettle();
          expected = entry.key.update(expected, entry.value);
          expect(submitted, expected);
          expect(find.byType(AssistantPersonalityFieldEditor), findsNothing);
          expectChrome(backLabel: language == 'en' ? 'Back' : 'Quay lại');
        }
        expect(repository.writes, 5);
        await tester.tap(
          find.byTooltip(language == 'en' ? 'Back' : 'Quay lại'),
        );
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
          await tester.tap(find.byTooltip('Back'));
          await tester.pumpAndSettle();
          final row = find.text('Synthetic preference');
          await tester.ensureVisible(row);
          await tester.tap(row);
        }
        await tester.pumpAndSettle();
        tester.view.viewInsets = const FakeViewPadding(bottom: 240);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpAndSettle();
        final save = find.byTooltip('Save');
        expectChrome();
        expect(save.hitTestable(), findsOneWidget);
        final dock = tester.getRect(find.byTooltip('Back'));
        expect(find.byTooltip('Back').hitTestable(), findsOneWidget);
        expect(dock.size.height, greaterThanOrEqualTo(48));
        expect(
          tester.getRect(save).top,
          greaterThanOrEqualTo(
            tester.getBottomLeft(find.byType(MobileSectionAppBar)).dy,
          ),
        );
        expect(tester.getRect(save).bottom, lessThanOrEqualTo(400));
        expect(tester.getRect(save).overlaps(dock), isFalse);
        expect(save.hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        if (back == 'dock') {
          await tester.tap(find.byTooltip('Back'));
        } else {
          await tester.binding.handlePopRoute();
        }
        await tester.pumpAndSettle();
        expect(find.byType(AppTextFormField), findsNothing);
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
      await tester.enterText(find.byType(AppTextFormField), 'Unsaved Nova');
      await tester.tap(find.byTooltip('Save'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<AppTextFormField>(find.byType(AppTextFormField))
            .controller!
            .text,
        'Unsaved Nova',
      );
      expect(
        find.text('Could not complete this change. Try again.').hitTestable(),
        findsOneWidget,
      );
      repository.write = (soul) async => soul;
      await tester.tap(find.byTooltip('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved Nova').hitTestable(), findsOneWidget);
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
    await tester.enterText(find.byType(AppTextFormField), 'Confirmed Nova');
    await tester.tap(find.byTooltip('Save'));
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
    expect(find.byTooltip('Done'), findsOneWidget);
    await tester.tap(find.byTooltip('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmed Nova').hitTestable(), findsOneWidget);
    expect(repository.writes, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
