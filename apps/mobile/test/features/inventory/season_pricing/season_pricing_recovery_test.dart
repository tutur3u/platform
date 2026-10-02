import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/inventory_sale_journal.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';

import 'sale_journal_fixture.dart';
import 'season_pricing_controller_test.dart' show lines, period, quote;

void main() {
  InventorySeasonPricingController make(
    MemorySaleStore store, {
    Future<String> Function(String, Map<String, dynamic>)? send,
    Future<String?> Function(String, String)? lookup,
    String actor = 'actor',
    String workspace = 'ws',
    String request = 'request',
  }) {
    final controller =
        InventorySeasonPricingController(
          journal: store.journal,
          fetch: (_, _) async => quote(),
          send:
              send ??
              (_, _) async =>
                  throw const ApiException(message: 'Timeout', statusCode: 0),
          lookupReceipt: lookup ?? (_, _) async => null,
          isOnline: () async => true,
          now: () => DateTime.utc(2026, 10),
          requestId: () => request,
        )..configure(
          actorId: actor,
          workspaceId: workspace,
          selectedPeriod: period(),
          currency: 'USD',
        );
    addTearDown(controller.dispose);
    return controller;
  }

  Future<String> submit(InventorySeasonPricingController controller) =>
      controller.submit(
        walletId: 'wallet',
        categoryId: 'category',
        products: lines,
        content: 'Sale',
      );

  test('durable write and exact readback precede the first POST', () async {
    final store = MemorySaleStore();
    final controller = make(
      store,
      send: (ws, body) async {
        final persisted = await store.journal.read('actor', ws);
        expect(persisted!.body, jsonEncode(body));
        return 'invoice';
      },
    );
    await controller.refresh();
    expect(await submit(controller), 'invoice');
    expect((await store.journal.read('actor', 'ws'))!.invoiceId, 'invoice');
    await expectLater(submit(controller), throwsStateError);
  });

  test('write failure and readback corruption send nothing', () async {
    for (final corrupt in [false, true]) {
      var sends = 0;
      final store = MemorySaleStore()
        ..failWrite = !corrupt
        ..corruptReadback = corrupt;
      final controller = make(
        store,
        send: (_, _) async {
          sends++;
          return 'invoice';
        },
      );
      await controller.refresh();
      await expectLater(submit(controller), throwsStateError);
      expect(sends, 0);
    }
  });

  test(
    'restart restores exact key/body and reconciles before explicit resend',
    () async {
      final store = MemorySaleStore();
      final original = make(store);
      await original.refresh();
      await expectLater(submit(original), throwsA(isA<ApiException>()));
      final raw = store.values.values.single;
      final events = <String>[];
      final restored = make(
        store,
        request: 'MUST-NOT-USE',
        lookup: (_, id) async {
          events.add('lookup:$id');
          return null;
        },
        send: (_, body) async {
          events.add('send:${body['inventory_request_id']}');
          return 'invoice';
        },
      );
      await restored.refresh();
      await Future<void>.delayed(Duration.zero);
      expect(restored.hasPending, isTrue);
      expect(store.values.values.single, raw);
      expect(events, isEmpty); // No background replay.
      await restored.retryPending();
      expect(events, ['lookup:request', 'send:request']);
      expect(restored.operation!.body, InventorySaleOperation.decode(raw).body);
    },
  );

  test(
    'switch hides original record, then restores it without generating a key',
    () async {
      final store = MemorySaleStore();
      final c = make(store);
      await c.refresh();
      await expectLater(submit(c), throwsA(isA<ApiException>()));
      c.configure(
        actorId: 'other',
        workspaceId: 'ws',
        selectedPeriod: null,
        currency: 'VND',
      );
      await Future<void>.delayed(Duration.zero);
      expect(c.hasPending, isFalse);
      expect(c.operation, isNull);
      expect(await store.journal.read('other', 'ws'), isNull);
      c.configure(
        actorId: 'actor',
        workspaceId: 'ws',
        selectedPeriod: null,
        currency: 'VND',
      );
      await Future<void>.delayed(Duration.zero);
      expect(c.hasPending, isTrue);
      expect(c.operation!.requestId, 'request');
      expect(c.currency, 'USD');
    },
  );

  test(
    'every later rejection preserves prior uncertainty and exact identity',
    () async {
      for (final code in [0, 400, 401, 403, 409, 422, 500, 503]) {
        final store = MemorySaleStore();
        var attempts = 0;
        final c = make(
          store,
          send: (_, _) async => throw ApiException(
            message: 'Failure',
            statusCode: attempts++ == 0 ? 0 : code,
          ),
        );
        await c.refresh();
        await expectLater(submit(c), throwsA(isA<ApiException>()));
        final before = store.values.values.single;
        await expectLater(c.retryPending(), throwsA(isA<ApiException>()));
        expect(c.hasPending, isTrue);
        expect(store.values.values.single, before);
      }
    },
  );

  test(
    'committed receipt completes without sending despite new metadata/currency',
    () async {
      final store = MemorySaleStore();
      final first = make(store);
      await first.refresh();
      await expectLater(submit(first), throwsA(isA<ApiException>()));
      var sends = 0;
      final c = make(
        store,
        lookup: (_, _) async => 'original-invoice',
        send: (_, _) async {
          sends++;
          return 'duplicate';
        },
      );
      await c.refresh();
      await Future<void>.delayed(Duration.zero);
      c.configure(
        actorId: 'actor',
        workspaceId: 'ws',
        selectedPeriod: null,
        currency: 'BHD',
      );
      expect(await c.retryPending(), 'original-invoice');
      expect(sends, 0);
      await expectLater(submit(c), throwsStateError);
    },
  );

  test(
    'denied or unavailable lookup retains record and performs no POST',
    () async {
      final store = MemorySaleStore();
      final first = make(store);
      await first.refresh();
      await expectLater(submit(first), throwsA(isA<ApiException>()));
      var sends = 0;
      final before = store.values.values.single;
      final c = make(
        store,
        lookup: (_, _) async =>
            throw const ApiException(message: 'Denied', statusCode: 403),
        send: (_, _) async {
          sends++;
          return 'duplicate';
        },
      );
      await c.refresh();
      await Future<void>.delayed(Duration.zero);
      await expectLater(c.retryPending(), throwsA(isA<ApiException>()));
      expect(sends, 0);
      expect(store.values.values.single, before);
    },
  );

  test('confirmation storage failure keeps known success terminal and '
      'durable prepared key', () async {
    final store = MemorySaleStore()..failConfirmation = true;
    final c = make(store, send: (_, _) async => 'invoice');
    await c.refresh();
    expect(await submit(c), 'invoice');
    expect(c.completedInvoiceId, 'invoice');
    expect((await store.journal.read('actor', 'ws'))!.invoiceId, isNull);
    await expectLater(submit(c), throwsStateError);
    await expectLater(c.acknowledgeCompletion(), throwsStateError);
    expect(store.values, isNotEmpty);
  });

  test('late completion updates original durable scope without exposing '
      'it to new actor', () async {
    final store = MemorySaleStore();
    final response = Completer<String>();
    final sent = Completer<void>();
    final c = make(
      store,
      send: (_, _) {
        sent.complete();
        return response.future;
      },
    );
    await c.refresh();
    final pending = submit(c);
    await sent.future;
    c.configure(
      actorId: 'other',
      workspaceId: 'other-ws',
      selectedPeriod: null,
      currency: 'VND',
    );
    response.complete('invoice');
    expect(await pending, 'invoice');
    await Future<void>.delayed(Duration.zero);
    expect(c.operation, isNull);
    expect(c.completedInvoiceId, isNull);
    expect((await store.journal.read('actor', 'ws'))!.invoiceId, 'invoice');
  });

  test('two controllers cannot prepare distinct concurrent operations in '
      'one scope', () async {
    final store = MemorySaleStore();
    var sends = 0;
    final response = Completer<String>();
    final started = Completer<void>();
    Future<String> send(String _, Map<String, dynamic> _) {
      sends++;
      if (!started.isCompleted) started.complete();
      return response.future;
    }

    final a = make(store, send: send, request: 'a');
    final b = make(store, send: send, request: 'b');
    await a.refresh();
    await b.refresh();
    final first = submit(a);
    await started.future;
    final second = submit(b);
    response.complete('invoice');
    expect(await first, 'invoice');
    expect(await second, 'invoice');
    expect(sends, 1);
    expect(b.operation!.requestId, 'a');
  });

  test(
    'corrupt stored scope/version fails closed instead of empty draft',
    () async {
      final store = MemorySaleStore();
      store.values['inventory_sale_v1:actor:ws'] = '{"version":99}';
      var sends = 0;
      final c = make(
        store,
        send: (_, _) async {
          sends++;
          return 'invoice';
        },
      );
      await c.refresh();
      await Future<void>.delayed(Duration.zero);
      expect(c.journalReady, isFalse);
      await expectLater(submit(c), throwsStateError);
      expect(sends, 0);
    },
  );

  test(
    'existing secure-storage adapter round trips and retains unresolved record',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final journal = InventorySaleJournal();
      final payload = {
        'inventory_request_id': 'request',
        'inventory_period_id': 'season',
        'content': 'Sale',
        'wallet_id': 'wallet',
        'category_id': 'category',
        'products': [
          {
            'product_id': 'product',
            'unit_id': 'unit',
            'warehouse_id': 'warehouse',
            'price_id': 'price',
            'quantity': 1,
            'price': 12.5,
          },
        ],
      };
      final operation = InventorySaleOperation(
        actor: 'actor',
        workspace: 'ws',
        requestId: 'request',
        body: jsonEncode(payload),
        currency: 'USD',
        periodName: 'Season',
        timeZone: 'UTC',
        asOf: DateTime.utc(2026, 10),
        createdAt: DateTime.utc(2026, 10),
      );
      await journal.locked('actor', 'ws', () => journal.write(operation));
      expect(
        (await InventorySaleJournal().read('actor', 'ws'))!.body,
        operation.body,
      );
      await expectLater(
        journal.acknowledge('actor', 'ws', 'invoice'),
        throwsStateError,
      );
      await journal.write(operation.confirmed('invoice'));
      await journal.acknowledge('actor', 'ws', 'invoice');
      expect(await journal.read('actor', 'ws'), isNull);
    },
  );
  test(
    'live actor change fences delayed restoration before configure',
    () async {
      final store = MemorySaleStore();
      final original = make(store);
      await original.refresh();
      await expectLater(submit(original), throwsA(isA<ApiException>()));
      final raw = store.values.values.single;
      final started = Completer<void>();
      final read = Completer<String?>();
      var actor = 'actor';
      final c =
          InventorySeasonPricingController(
            journal: InventorySaleJournal(
              read: (_) {
                started.complete();
                return read.future;
              },
            ),
            currentActor: () => actor,
            fetch: (_, _) async => quote(),
            send: (_, _) async => 'unused',
            isOnline: () async => true,
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      addTearDown(c.dispose);
      await started.future;
      actor = 'other';
      read.complete(raw);
      await c.refresh();
      expect(c.operation, isNull);
      expect(c.completedInvoiceId, isNull);
      expect(c.journalReady, isFalse);
    },
  );
}
