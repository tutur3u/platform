import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/view/finance_checkpoints_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

class _ArchiveRepository extends FinanceSceneRepository {
  final calls = <(String, bool)>[];

  @override
  Future<void> setWalletArchived({
    required String wsId,
    required String walletId,
    required bool archived,
    DateTime? now,
  }) async => calls.add((walletId, archived));
}

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

  Future<_ArchiveRepository> pumpPage(WidgetTester tester) async {
    final repository = _ArchiveRepository();
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    await tester.pumpWidget(
      DesignRenderApp(
        settings: DesignRender.themes['light']!.$1,
        brightness: Brightness.light,
        child: FinanceScreenScene(
          scene: FinanceScene.checkpoints,
          showAmounts: true,
          page: FinanceCheckpointsPage(repository: repository),
        ),
      ),
    );
    await pumpFinanceUntilVisible(tester, find.text('Everyday'));
    return repository;
  }

  testWidgets('archived wallets stay out until their filter is chosen', (
    tester,
  ) async {
    await pumpPage(tester);
    expect(find.text('Old cash'), findsNothing);
    expect(find.text('Balanced'), findsOneWidget);
    await tester.ensureVisible(find.text('Archived'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archived'));
    await tester.pumpAndSettle();
    expect(find.text('Old cash'), findsOneWidget);
    expect(find.text('Everyday'), findsNothing);

    await tester.ensureVisible(find.text('All').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('All').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('All-wallet check'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Old cash'), findsNothing);
    expect(find.textContaining('Everyday'), findsWidgets);
  });

  testWidgets('swiping archives a wallet at once and Undo restores it', (
    tester,
  ) async {
    final repository = await pumpPage(tester);
    await tester.drag(find.text('Credit'), const Offset(-300, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive'));
    await tester.pump();
    expect(repository.calls, [('credit-vnd', true)]);
    expect(find.text('Credit archived'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('Credit'), findsNothing);

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(repository.calls.last, ('credit-vnd', false));
    expect(find.text('Credit'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}
