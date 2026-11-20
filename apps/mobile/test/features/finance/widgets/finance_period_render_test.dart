import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

/// Phone renders of the Transactions period selector and filter strip and
/// of wallet checkpoints, written to `DESIGN_RENDER_DIR` when it is set.
void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    await seedFinanceSceneCache();
    await DesignRender.loadFonts();
  });

  for (final brightness in Brightness.values) {
    for (final scene in [FinanceScene.transactions, FinanceScene.checkpoints]) {
      testWidgets('${scene.name} renders in ${brightness.name}', (
        tester,
      ) async {
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        await tester.pumpWidget(
          DesignRenderApp(
            settings: DesignRender.themes[brightness.name]!.$1,
            brightness: brightness,
            child: FinanceScreenScene(
              scene: scene,
              showAmounts: true,
              page: scene == FinanceScene.checkpoints
                  ? FinanceCheckpointsPage(repository: FinanceSceneRepository())
                  : null,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await DesignRender.capture(
          tester,
          'finance-${scene.name}-${brightness.name}',
        );
        if (scene == FinanceScene.transactions) {
          await tester.tap(find.byKey(const ValueKey('finance-period-kind')));
          await tester.pumpAndSettle();
          await DesignRender.capture(
            tester,
            'finance-period-sheet-${brightness.name}',
          );
        }
      });
    }
  }
}
