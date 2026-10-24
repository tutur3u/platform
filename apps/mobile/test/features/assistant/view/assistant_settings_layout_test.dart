import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';
import '../local/assistant_local_chat_harness.dart';

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final width in [320.0, 390.0, 430.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('settings layout at $width and text scale $scale', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 844);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        final preferences = _Preferences();
        when(
          () => preferences.loadKeepLiveWhileBrowsing('ws'),
        ).thenAnswer((_) async => true);
        final models = AssistantLocalModelsCubit(
          workspaceId: 'ws',
          isScopeCurrent: () => true,
          store: LocalTestStore()..installed = false,
          preferences: AssistantLocalPreferences(currentUserId: () => 'user'),
          supported: () async => false,
        );

        await tester.pumpApp(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                padding: const EdgeInsets.fromLTRB(0, 47, 0, 34),
              ),
              child: SafeArea(
                child: AssistantSettingsHub(
                  workspaceId: 'ws',
                  isScopeCurrent: () => true,
                  preferences: preferences,
                  localModels: models,
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(MobileSectionAppBar), findsNothing);
        expect(find.byType(AppSheetScaffold), findsOneWidget);
        expect(find.text('Assistant Settings'), findsOneWidget);
        final header = tester.getRect(find.text('Assistant Settings'));
        final setting = tester.getRect(find.byType(AppToggleRow));
        expect(header.top, greaterThanOrEqualTo(47));
        expect(setting.top - header.bottom, inInclusiveRange(0, AppSpacing.xl));
        expect(setting.left, 16);
        expect(setting.right, width - 16);

        final scroll = find.byType(CustomScrollView).first;
        await tester.scrollUntilVisible(
          find.text('On-device models'),
          300,
          scrollable: find
              .descendant(of: scroll, matching: find.byType(Scrollable))
              .first,
        );
        expect(tester.getTopLeft(find.text('On-device models')).dx, 16);
        tester
            .state<ScrollableState>(
              find
                  .descendant(of: scroll, matching: find.byType(Scrollable))
                  .first,
            )
            .position
            .jumpTo(
              tester
                  .state<ScrollableState>(
                    find
                        .descendant(
                          of: scroll,
                          matching: find.byType(Scrollable),
                        )
                        .first,
                  )
                  .position
                  .maxScrollExtent,
            );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('License'), findsNothing);
        final l = tester.element(find.byType(AssistantSettingsHub)).l10n;
        // Remote is the last control in this unsupported-platform fixture.
        final finalControl = find.widgetWithText(
          AppListTile,
          l.assistantLocalRemote,
        );
        expect(finalControl, findsOneWidget);
        expect(
          844 - 34 - tester.getRect(finalControl).bottom,
          greaterThanOrEqualTo(16),
        );
        final info = find.byTooltip(
          l.assistantSettingInfo(l.assistantLocalTitle),
        );
        final infoButton = find
            .ancestor(of: info, matching: find.byType(AppIconButton))
            .first;
        await tester.ensureVisible(infoButton);
        await tester.pumpAndSettle();
        expect(infoButton.hitTestable(), findsOneWidget);
        await tester.tap(infoButton);
        await tester.pumpAndSettle();
        expect(
          find.textContaining(l.assistantLocalHistoryNotice),
          findsOneWidget,
        );
        expect(find.textContaining(l.assistantLocalHelp), findsOneWidget);
        expect(
          find.textContaining(l.assistantLocalBudgetDescription),
          findsOneWidget,
        );
        expect(find.textContaining(l.assistantLocalModeSwitch), findsOneWidget);
        expect(find.byType(AppDialog), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
