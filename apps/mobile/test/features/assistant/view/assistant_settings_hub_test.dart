import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
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

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  setUpAll(() => registerFallbackValue(() => true));
  testWidgets(
    'central editor uses shell chrome and confirms saved preference',
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
      await tester.pumpApp(
        AssistantSettingsHub(
          localModels: _localModels(),
          workspaceId: 'ws',
          locations: const {'/test'},
          isScopeCurrent: () => true,
          preferences: preferences,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(MobileSectionAppBar), findsOneWidget);
      expect(find.text('Assistant Settings'), findsOneWidget);
      expect(find.byKey(const ValueKey('settings-route-back')), findsOneWidget);
      expect(find.byType(Image), findsWidgets);
      expect(
        tester.getTopLeft(find.byType(AppToggleRow)).dy,
        greaterThan(tester.getBottomLeft(find.byType(MobileSectionAppBar)).dy),
      );
      expect(
        tester
            .widget<ShellTitleOverride>(find.byType(ShellTitleOverride))
            .title,
        'Assistant Settings',
      );
      expect(
        tester.widget<ShellMiniNav>(find.byType(ShellMiniNav)).items.single.id,
        'back',
      );
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
    await tester.pumpApp(
      AssistantSettingsHub(
        localModels: _localModels(),
        workspaceId: 'ws',
        locations: const {'/test'},
        isScopeCurrent: () => true,
        preferences: preferences,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AppToggleRow), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
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
  testWidgets('quick settings use the modal host and Back retains the page', (
    tester,
  ) async {
    final preferences = _Preferences();
    when(
      () => preferences.loadKeepLiveWhileBrowsing('ws'),
    ).thenAnswer((_) async => true);
    await tester.pumpApp(
      Builder(
        builder: (context) => AppButton.primary(
          onPressed: () => showAppSheet<void>(
            context: context,
            size: AppSheetSize.large,
            builder: (_) => AssistantSettingsHub(
              hosted: true,
              workspaceId: 'ws',
              locations: const {'/test'},
              isScopeCurrent: () => true,
              preferences: preferences,
              localModels: _localModels(),
            ),
          ),
          child: const Text('Open quick settings'),
        ),
      ),
    );
    await tester.tap(find.text('Open quick settings'));
    await tester.pumpAndSettle();
    expect(find.byType(AppSheetScaffold), findsOneWidget);
    expect(find.byType(MobileSectionAppBar), findsNothing);
    expect(find.byType(ShellMiniNav), findsNothing);
    expect(find.byType(ShellTitleOverride), findsNothing);
    expect(
      tester.widget<AppToggleRow>(find.byType(AppToggleRow)).value,
      isTrue,
    );
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(AssistantSettingsHub), findsNothing);
    expect(find.text('Open quick settings'), findsOneWidget);
  });
}
