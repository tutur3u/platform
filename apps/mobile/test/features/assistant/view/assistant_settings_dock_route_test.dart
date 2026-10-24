import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_settings_editor_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_info.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';

import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

GoRouter _router(Widget child) => GoRouter(
  initialLocation: '/settings',
  routes: [
    ShellRoute(
      builder: (context, state, child) =>
          _Shell(location: state.uri.path, child: child),
      routes: [
        GoRoute(
          path: '/settings',
          builder: (context, _) => Center(
            child: AppButton.primary(
              onPressed: () => context.push('/settings/assistant'),
              child: const Text('Open'),
            ),
          ),
        ),
        GoRoute(
          path: '/settings/assistant',
          builder: (_, _) => AssistantSettingsEditorPage(
            title: 'Assistant editor',
            child: child,
          ),
        ),
      ],
    ),
  ],
);

class _Shell extends StatelessWidget {
  const _Shell({required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) => Material(
    child: Column(
      children: [
        BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
          builder: (_, state) => MobileSectionAppBar(
            title: state.resolveForLocation(location) ?? 'Settings',
          ),
        ),
        Expanded(child: child),
        BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
          builder: (_, state) => PersistentShellDock(
            content: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppButton.ghost(
                  onPressed: () =>
                      unawaited(state.backForLocation(location)?.call()),
                  child: const Text('Back'),
                ),
                for (final action in state.resolveForLocation(location))
                  if (action.inDock) ShellDockActionButton(action: action),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

void main() {
  testWidgets(
    'routed editor saves from the one shell dock and retires actions',
    (tester) async {
      final repository = SettingsRepository();
      final saved = Completer<AssistantSoul>();
      repository.write = (_) => saved.future;
      final settings = AssistantPersonalSettingsCubit(
        workspaceId: 'workspace-a',
        isScopeCurrent: () => true,
        currentUserId: () => 'actor-a',
        repository: repository,
      );
      await settings.load();
      final chrome = ShellChromeActionsCubit();
      final titles = ShellTitleOverrideCubit();
      final nav = ShellMiniNavCubit();
      final router = _router(
        AssistantPersonalityFieldEditor(
          cubit: settings,
          field: AssistantPersonalityField.name,
          isScopeCurrent: () => true,
        ),
      );
      addTearDown(router.dispose);
      addTearDown(settings.close);
      addTearDown(chrome.close);
      addTearDown(titles.close);
      addTearDown(nav.close);
      await tester.pumpAppRouter(
        router,
        wrap: (app) => MultiBlocProvider(
          providers: [
            BlocProvider.value(value: chrome),
            BlocProvider.value(value: titles),
            BlocProvider.value(value: nav),
          ],
          child: app,
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.byType(MobileSectionAppBar), findsOneWidget);
      expect(find.byType(PersistentShellDock), findsOneWidget);
      expect(find.byType(AppSheetScaffold), findsNothing);
      expect(
        titles.state.resolveForLocation('/settings/assistant'),
        'Assistant editor',
        reason: '${titles.state.registrations}',
      );
      expect(find.text('Assistant editor'), findsOneWidget);
      expect(find.widgetWithText(AppButton, 'Save'), findsNothing);
      await tester.enterText(find.byType(AppTextFormField), 'Updated Mira');
      final oldSave = chrome.state
          .resolveForLocation('/settings/assistant')
          .single;
      await tester.tap(find.byTooltip('Save'));
      await tester.pump();
      expect(repository.writes, 1);
      expect(
        chrome.state.resolveForLocation('/settings/assistant').single.isLoading,
        isTrue,
      );
      oldSave.onPressed!();
      expect(repository.writes, 1);
      saved.complete(const AssistantSoul(name: 'Updated Mira'));
      await tester.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(chrome.state.resolveForLocation('/settings/assistant'), isEmpty);
      oldSave.onPressed!();
      expect(repository.writes, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('dialog takes dock action and Back restores the routed editor', (
    tester,
  ) async {
    var saves = 0;
    var current = true;
    final chrome = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    final nav = ShellMiniNavCubit();
    final router = _router(
      ListView(
        children: [
          const AssistantSettingsInfo(
            title: 'Explanation',
            description: 'Detail',
          ),
          AssistantSettingsAction(
            label: 'Save',
            isScopeCurrent: () => current,
            onPressed: () => saves++,
          ),
        ],
      ),
    );
    addTearDown(router.dispose);
    addTearDown(chrome.close);
    addTearDown(titles.close);
    addTearDown(nav.close);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: titles),
          BlocProvider.value(value: nav),
        ],
        child: app,
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final save = chrome.state.resolveForLocation('/settings/assistant').single;
    await tester.tap(find.byTooltip('About Explanation'));
    await tester.pumpAndSettle();
    expect(find.byType(AppDialog), findsOneWidget);
    expect(find.byType(PersistentShellDock), findsOneWidget);
    expect(
      chrome.state.resolveForLocation('/settings/assistant').single.tooltip,
      'Done',
    );
    save.onPressed!();
    expect(saves, 0);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.byType(AppDialog), findsNothing);
    expect(
      chrome.state.resolveForLocation('/settings/assistant').single.tooltip,
      'Save',
    );
    current = false;
    save.onPressed!();
    expect(saves, 0);
    await tester.tap(find.text('Back'));
    await tester.pump();
    save.onPressed!();
    expect(saves, 0);
    await tester.pumpAndSettle();
    expect(find.text('Open'), findsOneWidget);
    expect(chrome.state.resolveForLocation('/settings/assistant'), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
