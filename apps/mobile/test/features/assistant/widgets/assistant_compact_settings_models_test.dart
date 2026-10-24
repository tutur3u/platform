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
        expect(find.byType(AppButton), findsNothing);
        expect(find.text(l.assistantLocalLicense), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip(l.assistantLocalDownload));
        expect(installs, 1);
        await tester.tap(find.byTooltip(l.assistantSettingInfo(model.name)));
        await tester.pumpAndSettle();
        expect(find.byType(AppDialog), findsOneWidget);
        await tester.tap(find.text(l.assistantLocalLicense));
        expect(licenses, 1);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text(l.commonDone));
        await tester.pumpAndSettle();
        expect(find.byType(AppDialog), findsNothing);
      });
    }
  }

  for (final locale in ['en', 'vi']) {
    for (final scale in [1.0, 2.0]) {
      for (final selected in [false, true]) {
        testWidgets('installed model $locale $scale selected=$selected', (tester) async {
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
          await tester.pumpApp(Material(child: Padding(
            padding: const EdgeInsets.all(16),
            child: SingleChildScrollView(child: AssistantLocalModelTile(
              model: assistantLocalModels.first, installed: true,
              selected: selected, enabled: true, canRemove: true,
              onSelect: () => selections++, onRemove: () => removals++,
              onInstall: () => fail('Reinstalled'), onLicense: () {}, onSource: () {},
            )),
          )));
          final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
          expect(find.byTooltip(l.assistantLocalUse), selected ? findsNothing : findsOneWidget);
          if (!selected) {
            expect(find.byIcon(LucideIcons.arrowRight), findsOneWidget);
            await tester.tap(find.byTooltip(l.assistantLocalUse));
            expect(selections, 1);
          }
          await tester.tap(find.byTooltip(l.assistantLocalRemove));
          expect(removals, 1);
          expect(find.byType(AppDialog), findsNothing);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }

  testWidgets('installed model keeps selection and removal controls', (
    tester,
  ) async {
    var selected = 0;
    var removed = 0;
    final model = assistantLocalModels.first;
    await tester.pumpApp(
      Material(
        child: AssistantLocalModelTile(
          model: model,
          installed: true,
          selected: false,
          enabled: true,
          canRemove: true,
          onInstall: () => fail('Installed model installed again'),
          onSelect: () => selected++,
          onRemove: () => removed++,
          onLicense: () {},
          onSource: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
    await tester.tap(find.byTooltip(l.assistantLocalUse));
    expect(selected, 1);
    await tester.tap(find.byTooltip(l.assistantLocalRemove));
    await tester.pumpAndSettle();
    expect(removed, 1);
    expect(find.byType(AppDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('busy model cannot select or remove', (
    tester,
  ) async {
    final model = assistantLocalModels[1];
    await tester.pumpApp(
      Material(
        child: AssistantLocalModelTile(
          model: model,
          installed: true,
          selected: false,
          enabled: false,
          canRemove: false,
          onInstall: () => fail('Busy model installed'),
          onSelect: () => fail('Busy model selected'),
          onRemove: () => fail('Busy model removed'),
          onLicense: () {},
          onSource: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    final l = tester.element(find.byType(AssistantLocalModelTile)).l10n;
    await tester.tap(find.byTooltip(l.assistantLocalUse));
    await tester.tap(find.byTooltip(l.assistantLocalRemove));
    await tester.tap(find.byTooltip(l.assistantSettingInfo(model.name)));
    await tester.pumpAndSettle();
    expect(find.byType(AppDialog), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
