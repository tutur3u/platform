import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';
import '../local/assistant_local_chat_harness.dart';

class _Preferences extends Mock implements AssistantPreferences {}

AssistantLocalModelsCubit _localModels() => AssistantLocalModelsCubit(
  workspaceId: 'ws',
  isScopeCurrent: () => true,
  store: LocalTestStore()..installed = false,
  preferences: AssistantLocalPreferences(currentUserId: () => 'user'),
  supported: () async => false,
);

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
      header: BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
        builder: (_, state) => MobileSectionAppBar(
          title: state.resolveForLocation(location) ?? 'Settings',
        ),
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

Future<void> _mount(
  WidgetTester tester,
  AssistantPreferences preferences, {
  bool quickEntry = false,
}) async {
  final chrome = ShellChromeActionsCubit();
  final titles = ShellTitleOverrideCubit();
  final nav = ShellMiniNavCubit();
  final location = Routes.settingsAppPath('assistant');
  final models = _localModels();
  final router = GoRouter(
    initialLocation: quickEntry ? Routes.settings : location,
    routes: [
      ShellRoute(
        builder: (_, state, child) =>
            _Shell(location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: Routes.settings,
            builder: (context, _) => Center(
              child: AppButton.primary(
                onPressed: () => context.push(location),
                child: const Text('Open quick settings'),
              ),
            ),
          ),
          GoRoute(
            path: location,
            builder: (_, _) => AssistantSettingsHub(
              localModels: models,
              workspaceId: 'ws',
              isScopeCurrent: () => true,
              preferences: preferences,
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
}

void _expectChrome(WidgetTester tester) {
  expect(find.byType(AppBar), findsNothing);
  expect(find.byType(MobileSectionAppBar), findsOneWidget);
  expect(find.byType(PersistentShellDock), findsOneWidget);
  expect(find.byType(AppSheetScaffold), findsNothing);
  expect(find.text('Assistant Settings'), findsOneWidget);
  expect(find.byKey(const ValueKey('settings-route-back')), findsNothing);
  expect(find.byType(ShellTitleOverride), findsOneWidget);
  expect(find.byType(ShellMiniNav), findsOneWidget);
  expect(find.byTooltip('Back').hitTestable(), findsOneWidget);
  expect(find.byType(Image), findsOneWidget);
  expect(
    find.descendant(
      of: find.byType(AssistantSettingsHub),
      matching: find.byType(Image),
    ),
    findsNothing,
  );
  expect(
    find.descendant(
      of: find.byType(MobileSectionAppBar),
      matching: find.byTooltip('Back'),
    ),
    findsNothing,
  );
  expect(
    tester.getTopLeft(find.byType(AppToggleRow)).dy,
    greaterThan(tester.getBottomLeft(find.byType(MobileSectionAppBar)).dy),
  );
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  setUpAll(() => registerFallbackValue(() => true));
  testWidgets(
    'central editor uses the shell route and confirms saved preference',
    (tester) async {
      final preferences = _Preferences();
      when(
        () => preferences.loadKeepLiveWhileBrowsing('ws'),
      ).thenAnswer((_) async => true);
      final saved = Completer<void>();
      when(
        () => preferences.saveKeepLiveWhileBrowsing(
          'ws',
          value: false,
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) => saved.future);
      await _mount(tester, preferences);
      await tester.pumpAndSettle();
      _expectChrome(tester);
      expect(
        tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
        isTrue,
      );
      await tester.tap(find.byType(AppToggleRow));
      await tester.pump();
      expect(
        tester.widget<AppToggleRow>(find.byType(AppToggleRow)).onChanged,
        isNull,
      );
      expect(
        tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
        isTrue,
      );
      saved.complete();
      await tester.pumpAndSettle();
      expect(
        tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
        isFalse,
      );
      verify(
        () => preferences.saveKeepLiveWhileBrowsing(
          'ws',
          value: false,
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).called(1);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.byType(AssistantSettingsHub), findsNothing);
      expect(find.text('Open quick settings'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('unknown stored preference cannot be overwritten and can retry', (
    tester,
  ) async {
    final preferences = _Preferences();
    when(
      () => preferences.loadKeepLiveWhileBrowsing('ws'),
    ).thenThrow(StateError('Unavailable'));
    await _mount(tester, preferences);
    await tester.pumpAndSettle();
    expect(find.byType(AppToggleRow), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
    verifyNever(
      () => preferences.saveKeepLiveWhileBrowsing(
        'ws',
        value: any(named: 'value'),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    );
    when(
      () => preferences.loadKeepLiveWhileBrowsing('ws'),
    ).thenAnswer((_) async => true);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
      isTrue,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
  for (final back in ['dock', 'system']) {
    testWidgets('quick settings use the shared route and $back Back retains '
        'the page', (tester) async {
      final preferences = _Preferences();
      when(
        () => preferences.loadKeepLiveWhileBrowsing('ws'),
      ).thenAnswer((_) async => true);
      await _mount(tester, preferences, quickEntry: true);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open quick settings'));
      await tester.pumpAndSettle();
      _expectChrome(tester);
      expect(
        tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
        isTrue,
      );
      if (back == 'dock') {
        await tester.tap(find.byTooltip('Back'));
      } else {
        await tester.binding.handlePopRoute();
      }
      await tester.pumpAndSettle();
      expect(find.byType(AssistantSettingsHub), findsNothing);
      expect(find.text('Open quick settings'), findsOneWidget);
      expect(find.byType(MobileSectionAppBar), findsOneWidget);
      expect(find.byType(PersistentShellDock), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
