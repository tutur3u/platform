import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_sales_period.dart';
import 'package:mobile/data/models/inventory/inventory_season_price.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';

import 'sale_journal_fixture.dart';

Map<String, dynamic> priceRow({
  String id = 'quote-1',
  String currency = 'USD',
  String from = '2026-10-01T00:00:00Z',
  String? to,
  double price = 12.5,
}) => {
  'id': id,
  'period_id': 'season',
  'product_id': 'product',
  'unit_id': 'unit',
  'warehouse_id': 'warehouse',
  'currency': currency,
  'price': price,
  'valid_from': from,
  'valid_to': to,
};
InventorySeasonQuote quote({
  List<Map<String, dynamic>>? rows,
  String asOf = '2026-10-01T01:00:00Z',
}) => InventorySeasonQuote.fromJson({
  'as_of': asOf,
  'data': rows ?? [priceRow()],
});
InventorySalesPeriod period({
  String scope = 'all',
  List<String> ids = const [],
  String zone = 'America/Los_Angeles',
  String date = '2026-09-30',
}) => InventorySalesPeriod(
  id: 'season',
  name: 'Season',
  status: 'active',
  saleCount: 0,
  pricingMode: 'scheduled',
  timeZone: zone,
  startsAt: DateTime.parse(date),
  endsAt: DateTime.parse(date),
  productScope: scope,
  productIds: ids,
);
const List<Map<String, dynamic>> lines = [
  {
    'product_id': 'product',
    'unit_id': 'unit',
    'warehouse_id': 'warehouse',
    'quantity': 2,
    'price': 999999,
  },
];

void main() {
  test(
    'server as_of resolves half-open intervals and keeps currencies separate',
    () {
      final q = quote(
        rows: [
          priceRow(id: 'ended', to: '2026-10-01T01:00:00Z'),
          priceRow(id: 'current', from: '2026-10-01T01:00:00Z'),
          priceRow(id: 'other', currency: 'VND'),
          priceRow(id: 'future', from: '2026-10-02T00:00:00Z'),
        ],
      );
      expect(
        q.resolve('season', 'usd')['product|unit|warehouse']?.id,
        'current',
      );
      expect(q.resolve('different-season', 'USD'), isEmpty);
      expect(
        () => quote(
          rows: [
            priceRow(),
            priceRow(id: 'duplicate'),
          ],
        ).resolve('season', 'USD'),
        throwsFormatException,
      );
    },
  );
  test(
    'missing timestamp, malformed amount and timezone-less instant fail closed',
    () {
      expect(
        () => InventorySeasonQuote.fromJson({'data': <dynamic>[]}),
        throwsFormatException,
      );
      expect(() => quote(asOf: '2026-10-01T01:00:00'), throwsFormatException);
      expect(
        () => quote(rows: [priceRow(price: double.nan)]),
        throwsFormatException,
      );
      expect(() => quote(rows: [priceRow(price: -1)]), throwsFormatException);
    },
  );

  test(
    'currency precision rejects malformed cents; preserves BHD decimals',
    () {
      expect(
        () => quote(rows: [priceRow(price: 12.345)]).resolve('season', 'USD'),
        throwsFormatException,
      );
      expect(
        quote(
          rows: [priceRow(price: 12.345, currency: 'BHD')],
        ).resolve('season', 'BHD').values.single.price,
        12.345,
      );
      expect(
        () => quote(rows: [priceRow(currency: 'VND')]).resolve('season', 'VND'),
        throwsFormatException,
      );
    },
  );

  late DateTime now;
  late bool online;
  late InventorySeasonPricingController controller;
  late List<Map<String, dynamic>> sent;
  Future<String> submit() => controller.submit(
    walletId: 'wallet',
    categoryId: 'category',
    products: lines,
    content: 'Sale',
    notes: 'note',
  );
  setUp(() {
    now = DateTime.utc(2026, 10);
    online = true;
    sent = [];
    controller =
        InventorySeasonPricingController(
          journal: MemorySaleStore().journal,
          lookupReceipt: (_, _) async => null,
          fetch: (_, _) async => quote(),
          send: (_, payload) async {
            sent.add(payload);
            return 'invoice';
          },
          isOnline: () async => online,
          now: () => now,
          requestId: () => 'stable-id',
        )..configure(
          actorId: 'actor',
          workspaceId: 'ws',
          selectedPeriod: period(),
          currency: 'USD',
        );
  });
  tearDown(() => controller.dispose());
  test(
    'cached prices queue a draft without claiming a confirmed sale',
    () async {
      controller.dispose();
      online = false;
      final queued = <Map<String, dynamic>>[];
      final confirmed = quote();
      controller =
          InventorySeasonPricingController(
            journal: MemorySaleStore().journal,
            fetch: (_, _) async => InventorySeasonQuote(
              asOf: confirmed.asOf,
              prices: confirmed.prices,
              isCached: true,
            ),
            send: (_, payload) async {
              sent.add(payload);
              return 'server-sale';
            },
            enqueueOffline: (_, payload) async {
              queued.add(payload);
              return 'stable-id';
            },
            isOnline: () async => online,
            now: () => now,
            requestId: () => 'stable-id',
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      await controller.refresh();
      expect(controller.offlineDraft, isTrue);
      expect(controller.ready, isTrue);
      expect(await submit(), 'stable-id');
      expect(sent, isEmpty);
      expect(queued.single['inventory_request_id'], 'stable-id');
      expect(queued.single['inventory_period_id'], 'season');
      expect(controller.queuedOffline, isTrue);
      expect(controller.completedInvoiceId, isNull);
      expect(controller.queuedMutationId, 'stable-id');
      expect(
        (queued.single['products'] as List).single,
        containsPair('price', 12.5),
      );
      expect(
        (queued.single['products'] as List).single,
        containsPair('price_id', 'quote-1'),
      );
      await expectLater(submit(), throwsStateError);
      expect(queued, hasLength(1));
      expect(controller.operation, isNull);
      expect(controller.ready, isFalse);
    },
  );
  test(
    'server timezone date and fresh quote required; uses quote price IDs',
    () async {
      await controller.refresh();
      expect(controller.ready, isTrue); // Sep 30 in LA, Oct 1 UTC.
      await submit();
      expect(sent.single['price_mode'], 'custom');
      expect(sent.single['inventory_period_id'], 'season');
      expect(sent.single['inventory_request_id'], 'stable-id');
      expect(
        (sent.single['products'] as List).single,
        containsPair('price', 12.5),
      ); // Ignores injected catalog price.
      expect(
        (sent.single['products'] as List).single,
        containsPair('price_id', 'quote-1'),
      );
      now = now.add(const Duration(seconds: 15));
      expect(controller.ready, isFalse);
      await expectLater(submit(), throwsStateError);
      expect(sent, hasLength(1));
    },
  );
  test(
    'product allow/block lists and wallet currency mismatch block sales',
    () async {
      for (final selection in [
        period(scope: 'allowlist'),
        period(scope: 'blocklist', ids: ['product']),
      ]) {
        controller.configure(
          actorId: 'actor',
          workspaceId: 'ws',
          selectedPeriod: selection,
          currency: 'USD',
        );
        await controller.refresh();
        await expectLater(submit(), throwsStateError);
      }
      controller.configure(
        actorId: 'actor',
        workspaceId: 'ws',
        selectedPeriod: period(),
        currency: 'JPY',
      );
      await controller.refresh();
      await expectLater(submit(), throwsStateError);
      expect(sent, isEmpty);
    },
  );
  test(
    'large line total is rejected before integer overflow or POST',
    () async {
      await controller.refresh();
      await expectLater(
        controller.submit(
          walletId: 'wallet',
          categoryId: 'category',
          content: 'Sale',
          products: [
            {
              'product_id': 'product',
              'unit_id': 'unit',
              'warehouse_id': 'warehouse',
              'quantity': 9007199254740991,
            },
          ],
        ),
        throwsStateError,
      );
      expect(sent, isEmpty);
    },
  );

  test(
    'offline read clears quote and offline submission never sends',
    () async {
      await controller.refresh();
      online = false;
      await expectLater(submit(), throwsStateError);
      await controller.refresh();
      expect(controller.quote, isNull);
      expect(sent, isEmpty);
    },
  );
  test('late workspace/actor response cannot repopulate quote', () async {
    controller.dispose();
    final completer = Completer<InventorySeasonQuote>();
    controller =
        InventorySeasonPricingController(
          journal: MemorySaleStore().journal,
          lookupReceipt: (_, _) async => null,
          fetch: (_, _) => completer.future,
          send: (_, _) async => 'unused',
          isOnline: () async => true,
        )..configure(
          actorId: 'old',
          workspaceId: 'old-ws',
          selectedPeriod: period(),
          currency: 'USD',
        );
    final loading = controller.refresh();
    await Future<void>.delayed(Duration.zero);
    controller.configure(
      actorId: 'new',
      workspaceId: 'new-ws',
      selectedPeriod: null,
      currency: 'VND',
    );
    completer.complete(quote());
    await loading;
    expect(controller.quote, isNull);
    expect(controller.prices, isEmpty);
  });
  test(
    'uncertain response retries exact detached payload even when cart changes',
    () async {
      controller.dispose();
      var attempts = 0;
      controller =
          InventorySeasonPricingController(
            journal: MemorySaleStore().journal,
            lookupReceipt: (_, _) async => null,
            fetch: (_, _) async => quote(),
            send: (_, payload) async {
              sent.add(payload);
              attempts++;
              if (attempts == 1) {
                throw const ApiException.transport(message: 'timeout');
              }
              return 'same-invoice';
            },
            isOnline: () async => online,
            now: () => now,
            requestId: () => 'stable-id',
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      await controller.refresh();
      await expectLater(submit(), throwsA(isA<ApiException>()));
      expect(controller.hasPending, isTrue);
      now = now.add(const Duration(minutes: 5));
      expect(
        controller.priceFor('product|unit|warehouse', 'product')?.price,
        12.5,
      );
      await controller.submit(
        walletId: 'different',
        categoryId: 'different',
        products: [],
        content: 'changed',
      );
      expect(jsonEncode(sent[1]), jsonEncode(sent[0]));
      expect(controller.hasPending, isFalse);
    },
  );
  test('scope switch while online check waits prevents POST', () async {
    controller.dispose();
    final check = Completer<bool>();
    final started = Completer<void>();
    controller =
        InventorySeasonPricingController(
          journal: MemorySaleStore().journal,
          lookupReceipt: (_, _) async => null,
          fetch: (_, _) async => quote(),
          send: (_, payload) async {
            sent.add(payload);
            return 'unused';
          },
          isOnline: () {
            started.complete();
            return check.future;
          },
        )..configure(
          actorId: 'actor',
          workspaceId: 'ws',
          selectedPeriod: period(),
          currency: 'USD',
        );
    await Future<void>.delayed(Duration.zero);
    expect(controller.journalReady, isTrue);
    final pending = submit();
    await started.future;
    controller.configure(
      actorId: 'new',
      workspaceId: 'new-ws',
      selectedPeriod: null,
      currency: 'USD',
    );
    check.complete(true);
    await expectLater(pending, throwsStateError);
    expect(sent, isEmpty);
  });
  test('expiry notifies once rather than on every stale timer tick', () async {
    await controller.refresh();
    var notifications = 0;
    controller
      ..addListener(() => notifications++)
      ..tick();
    expect(notifications, 0);
    now = now.add(const Duration(seconds: 15));
    controller
      ..tick()
      ..tick()
      ..tick();
    expect(notifications, 1);
    expect(controller.ready, isFalse);
  });
  test('403/503 responses remove visible quote', () async {
    for (final code in [403, 503]) {
      controller.dispose();
      controller =
          InventorySeasonPricingController(
            journal: MemorySaleStore().journal,
            lookupReceipt: (_, _) async => null,
            fetch: (_, _) async =>
                throw ApiException(message: 'unavailable', statusCode: code),
            send: (_, _) async => 'unused',
            isOnline: () async => true,
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      await controller.refresh();
      expect(controller.ready, isFalse);
      expect(controller.quote, isNull);
    }
  });
  test('failed automatic quotes retry at most every ten seconds', () async {
    controller.dispose();
    var reads = 0;
    controller =
        InventorySeasonPricingController(
          journal: MemorySaleStore().journal,
          lookupReceipt: (_, _) async => null,
          fetch: (_, _) async {
            reads++;
            throw const ApiException(message: 'Unavailable', statusCode: 503);
          },
          send: (_, _) async => 'unused',
          isOnline: () async => true,
          now: () => now,
        )..configure(
          actorId: 'actor',
          workspaceId: 'ws',
          selectedPeriod: period(),
          currency: 'USD',
        );
    await controller.refresh(automatic: true);
    for (var i = 0; i < 9; i++) {
      now = now.add(const Duration(seconds: 1));
      await controller.refresh(automatic: true);
    }
    expect(reads, 1);
    now = now.add(const Duration(seconds: 1));
    await controller.refresh(automatic: true);
    expect(reads, 2);
    await controller.refresh();
    expect(reads, 3);
    expect(controller.quote, isNull);
  });
  test(
    'overlapping manual and automatic quotes share one scope request',
    () async {
      final response = Completer<InventorySeasonQuote>();
      var reads = 0;
      final controller =
          InventorySeasonPricingController(
            journal: MemorySaleStore().journal,
            lookupReceipt: (_, _) async => null,
            fetch: (_, _) {
              reads++;
              return response.future;
            },
            send: (_, _) async => 'unused',
            isOnline: () async => true,
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      final first = controller.refresh();
      final second = controller.refresh(automatic: true);
      final third = controller.refresh();
      expect(identical(first, second), isTrue);
      expect(identical(first, third), isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(reads, 1);
      response.complete(quote());
      await Future.wait([first, second, third]);
      expect(controller.loading, isFalse);
      expect(controller.quote, isNotNull);
      controller.dispose();
    },
  );
}
