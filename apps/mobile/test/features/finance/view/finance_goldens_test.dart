@Tags(['golden'])
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/golden_tolerance.dart';
import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final original = goldenFileComparator;
  setUpAll(() async {
    goldenFileComparator = GoldenTolerance(
      File('test/features/finance/view/finance_goldens_test.dart').absolute.uri,
    );
    if (!Platform.isLinux) return;
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('mobile/shell_back'),
        (_) async => null,
      )
      ..setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.app_links/events'),
        (_) async => null,
      );
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    await seedFinanceSceneCache();
    for (final font in const {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'Nunito': 'assets/fonts/Nunito-Variable.ttf',
      'JetBrainsMono': 'assets/fonts/JetBrainsMono-Variable.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
      'LucideLabIcons': 'assets/fonts/lucide/LucideLabIcons.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (scene, showAmounts) in [
    (FinanceScene.overview, false),
    (FinanceScene.overview, true),
    for (final scene in FinanceScene.values.skip(1)) (scene, false),
    (null, false),
  ]) {
    final form = scene == null;
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size, top, bottom) in [
          ('phone', const Size(390, 844), 48.0, 34.0),
          ('tablet', const Size(834, 1194), 24.0, 20.0),
        ]) {
          final nameBase = scene == null
              ? 'transaction_create'
              : 'finance_${scene.name}${showAmounts ? '_shown' : ''}';
          final name = '${nameBase}_${design}_${brightness.name}_$device';
          testWidgets(name, skip: !Platform.isLinux, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(top: top, bottom: bottom)
              ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              sorbetTestApp(
                sorbet: sorbet,
                brightness: brightness,
                boundaryKey: const ValueKey('golden'),
                home: scene == null
                    ? Builder(
                        builder: (context) => Center(
                          child: TextButton(
                            onPressed: () => unawaited(
                              showCreateTransactionSheet(
                                context,
                                wsId: 'workspace',
                                repository: FinanceSceneRepository(),
                                initialWalletId: 'wallet-vnd',
                                initialTakenAt: financeSceneDate,
                                onCreate:
                                    ({
                                      required amount,
                                      description,
                                      takenAt,
                                      walletId,
                                      categoryId,
                                      tagIds,
                                      reportOptIn,
                                      isAmountConfidential,
                                      isDescriptionConfidential,
                                      isCategoryConfidential,
                                    }) async => 'new-transaction',
                              ),
                            ),
                            child: const Text('Open form'),
                          ),
                        ),
                      )
                    : FinanceScreenScene(
                        scene: scene,
                        showAmounts: showAmounts,
                      ),
              ),
            );
            if (scene == FinanceScene.transactionDetail) {
              await tester.tap(find.text('Open transaction details'));
            }
            if (form) {
              await tester.tap(find.text('Open form'));
              await tester.pumpAndSettle();
              expect(find.text('New transaction'), findsOneWidget);
              await tester.tap(find.byKey(const ValueKey('money-key-Done')));
              await tester.pumpAndSettle();
              await tester.tap(find.text('Groceries'));
            }
            await tester.pumpAndSettle();
            if (scene == FinanceScene.wallets ||
                scene == FinanceScene.categories) {
              await pumpFinanceUntilVisible(
                tester,
                find.text(
                  scene == FinanceScene.wallets ? 'Everyday' : 'Groceries',
                ),
              );
              await tester.pumpAndSettle();
            }
            expect(tester.takeException(), isNull);
            await expectLater(
              find.byKey(const ValueKey('golden')),
              matchesGoldenFile('goldens/$name.png'),
            );
          });
        }
      }
    }
  }
}
