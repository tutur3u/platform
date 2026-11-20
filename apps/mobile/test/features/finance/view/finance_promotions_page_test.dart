import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/view/finance_promotions_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import 'finance_promotion_fixtures.dart';
import 'finance_scenes.dart';

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'http://localhost');

  Object? body;

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    this.body = body;
    return {'invoice_id': 'invoice-1'};
  }
}

void main() {
  test('promotions parse usage and send the unit the API expects', () {
    final promotion = FinancePromotion.fromJson(const {
      'id': 'p',
      'name': 'Spring',
      'code': 'S10',
      'value': '12.5',
      'use_ratio': false,
      'max_uses': 3,
      'current_uses': 3,
    });
    expect(promotion.value, 12.5);
    expect(promotion.usedUp, isTrue);
    expect(promotion.toPayload(), containsPair('unit', 'currency'));
    expect(
      financeScenePromotions.first.toPayload(),
      containsPair('unit', 'percentage'),
    );
  });

  test('a chosen promotion reaches the invoice request', () async {
    final api = _Api();
    final repository = FinanceRepository(
      apiClient: api,
      cacheUserId: () => null,
    );
    await repository
        .createInvoice(
          workspace: 'ws',
          walletId: 'w',
          customerId: null,
          categoryId: null,
          content: 'Lessons',
          notes: '',
          lines: const <FinanceInvoiceLine>[],
          promotionId: 'spring',
        )
        .catchError((Object _) => '');
    expect(api.body, containsPair('promotion_id', 'spring'));
  });

  group('page', () {
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
      );
      await seedFinanceSceneCache();
      await DesignRender.loadFonts();
    });

    Future<FinanceScenePromotionsRepository> pump(
      WidgetTester tester, {
      Brightness brightness = Brightness.light,
      List<FinancePromotion> rows = financeScenePromotions,
    }) async {
      final repository = FinanceScenePromotionsRepository(rows);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: FinanceScreenScene(
            scene: FinanceScene.promotions,
            showAmounts: true,
            page: FinancePromotionsPage(
              repository: repository,
              financeRepository: FinanceSceneRepository(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return repository;
    }

    for (final brightness in Brightness.values) {
      testWidgets('lists codes, discounts and usage in ${brightness.name}', (
        tester,
      ) async {
        await pump(tester, brightness: brightness);
        expect(find.text('10%'), findsOneWidget);
        expect(find.text('12 of 50 used'), findsOneWidget);
        expect(find.text('Used up'), findsOneWidget);
        await DesignRender.capture(
          tester,
          'finance-promotions-${brightness.name}',
        );
      });
    }

    testWidgets('validates and creates a promotion', (tester) async {
      final repository = await pump(tester, rows: const []);
      await tester.tap(find.text('New promotion').last);
      await tester.pumpAndSettle();
      await DesignRender.capture(tester, 'finance-promotion-form-light');
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('promotion-value')),
          matching: find.byType(EditableText),
        ),
        '150',
      );
      await tester.tap(find.byKey(const ValueKey('promotion-save')));
      await tester.pumpAndSettle();
      expect(find.text('Enter a name'), findsOneWidget);
      expect(find.text('Enter a discount from 0 to 100%'), findsOneWidget);
      for (final (key, text) in [
        ('promotion-name', 'Spring sale'),
        ('promotion-code', 'SPRING10'),
        ('promotion-value', '10'),
        ('promotion-max-uses', '50'),
      ]) {
        await tester.enterText(
          find.descendant(
            of: find.byKey(ValueKey(key)),
            matching: find.byType(EditableText),
          ),
          text,
        );
      }
      await tester.tap(find.byKey(const ValueKey('promotion-save')));
      await tester.pumpAndSettle();
      expect(repository.calls.single, contains('code: SPRING10'));
      expect(repository.calls.single, contains('max_uses: 50'));
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('edits and deletes after confirming', (tester) async {
      final repository = await pump(tester);
      await tester.tap(find.text('Loyal customer'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('promotion-delete')));
      await tester.pumpAndSettle();
      expect(find.text('Delete Loyal customer?'), findsOneWidget);
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      expect(repository.calls, ['delete:loyal']);
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
