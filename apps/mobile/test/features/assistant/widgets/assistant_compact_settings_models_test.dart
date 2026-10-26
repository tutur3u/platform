import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_model_tile.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/pump_app.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('compact model actions at 320px, $locale, $scale', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(320, 844);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.localesTestValue = [Locale(locale)];
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearLocalesTestValue);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        var installs = 0;
        var licenses = 0;
        final model = assistantLocalModels[1];
        await tester.pumpApp(
          Material(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Align(
                alignment: Alignment.topCenter,
                child: AssistantLocalModelTile(
                  model: model,
                  installed: false,
                  selected: false,
                  enabled: true,
                  canRemove: false,
                  onInstall: () => installs++,
                  onSelect: () => fail('Uninstalled model selected'),
                  onRemove: () => fail('Uninstalled model removed'),
                  onLicense: () => licenses++,
                  onSource: () {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
        // One trailing action; license and publisher live in the row menu.
        expect(find.byType(AppButton), findsNothing);
        expect(find.text(l.assistantLocalLicense), findsNothing);
        expect(
          find.byTooltip(l.assistantSettingInfo(model.name)),
          findsNothing,
        );
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip(l.assistantLocalDownload));
        expect(installs, 1);
        await tester.tap(find.text(model.name));
        await tester.pumpAndSettle();
        expect(find.byType(AppActionSheet<String>), findsOneWidget);
        await tester.tap(find.text(l.assistantLocalLicense));
        await tester.pumpAndSettle();
        expect(licenses, 1);
        expect(find.byType(AppActionSheet<String>), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }

  Future<void> pumpTile(
    WidgetTester tester, {
    required bool selected,
    bool enabled = true,
    bool canRemove = true,
    VoidCallback? onSelect,
    VoidCallback? onRemove,
  }) => tester.pumpApp(
    Material(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: AssistantLocalModelTile(
            model: assistantLocalModels.first,
            installed: true,
            selected: selected,
            enabled: enabled,
            canRemove: canRemove,
            onSelect: onSelect ?? () => fail('Unexpected selection'),
            onRemove: onRemove ?? () => fail('Unexpected removal'),
            onInstall: () => fail('Reinstalled'),
            onLicense: () {},
            onSource: () {},
          ),
        ),
      ),
    ),
  );

  for (final locale in ['en', 'vi']) {
    for (final scale in [1.0, 2.0]) {
      for (final selected in [false, true]) {
        testWidgets('installed model $locale $scale selected=$selected', (
          tester,
        ) async {
          tester.view.physicalSize = const Size(320, 844);
          tester.view.devicePixelRatio = 1;
          tester.platformDispatcher.localesTestValue = [Locale(locale)];
          tester.platformDispatcher.textScaleFactorTestValue = scale;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.platformDispatcher.clearLocalesTestValue);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          var removals = 0;
          var selections = 0;
          await pumpTile(
            tester,
            selected: selected,
            onSelect: () => selections++,
            onRemove: () => removals++,
          );
          final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
          expect(
            find.byTooltip(l.assistantLocalUse),
            selected ? findsNothing : findsOneWidget,
          );
          expect(
            find.bySemanticsLabel(l.assistantLocalSelected),
            selected ? findsOneWidget : findsNothing,
          );
          if (!selected) {
            await tester.tap(find.byTooltip(l.assistantLocalUse));
            expect(selections, 1);
          }
          await tester.tap(find.text(assistantLocalModels.first.name));
          await tester.pumpAndSettle();
          await tester.tap(find.text(l.assistantLocalRemove));
          await tester.pumpAndSettle();
          expect(removals, 1);
          expect(find.byType(AppDialog), findsNothing);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }

  testWidgets('busy model cannot select or remove', (tester) async {
    await pumpTile(tester, selected: false, enabled: false, canRemove: false);
    await tester.pumpAndSettle();
    final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
    await tester.tap(find.byTooltip(l.assistantLocalUse));
    await tester.tap(find.text(assistantLocalModels.first.name));
    await tester.pumpAndSettle();
    // Disabled menu actions stay visible but do nothing.
    await tester.tap(find.text(l.assistantLocalUse));
    await tester.tap(find.text(l.assistantLocalRemove));
    await tester.pumpAndSettle();
    expect(find.byType(AppActionSheet<String>), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
