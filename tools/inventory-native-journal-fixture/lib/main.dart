import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// CI copies this exact production source; it never substitutes storage methods.
import 'inventory_sale_journal.dart';
import 'fixture_runner.dart' as runner;

const _channel = MethodChannel('fixture/sale_journal');
const _run = String.fromEnvironment('FIXTURE_RUN');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final result = await runner.runFixture(
    exercisePhase: exercise,
    requestIds: records.map((record) => record.requestId).toList(),
    phase: () => _channel.invokeMethod<String>('phase'),
    report: (value) => _channel.invokeMethod<void>('report', jsonEncode(value)),
  );
  runApp(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: Text(
            'Native journal ${result['phase']}: '
            '${result['passed'] == true ? 'PASS' : 'FAIL'}',
          ),
        ),
      ),
    ),
  );
}

void require(bool condition, String message) {
  if (!condition) throw StateError(message);
}

List<InventorySaleOperation> get records => [
  operation('actor-a', 'workspace-a', '00000000-0000-4000-8000-000000000001'),
  operation('actor-b', 'workspace-a', '00000000-0000-4000-8000-000000000002'),
  operation('actor-a', 'workspace-b', '00000000-0000-4000-8000-000000000003'),
];

InventorySaleOperation operation(
  String actor,
  String workspace,
  String id, {
  String run = _run,
}) => InventorySaleOperation(
  actor: 'native-fixture:$run:$actor',
  workspace: 'native-fixture:$run:$workspace',
  requestId: id,
  body: jsonEncode({
    'inventory_request_id': id,
    'inventory_period_id': 'synthetic-period',
    'wallet_id': 'synthetic-wallet',
    'category_id': 'synthetic-category',
    'content': 'Synthetic native durability fixture',
    'products': [
      {
        'product_id': 'synthetic-product',
        'unit_id': 'synthetic-unit',
        'warehouse_id': 'synthetic-warehouse',
        'price_id': 'synthetic-price',
        'quantity': 2,
        'price': 12.5,
      },
    ],
  }),
  currency: 'USD',
  periodName: 'Synthetic period',
  timeZone: 'Asia/Ho_Chi_Minh',
  asOf: DateTime.utc(2026, 10),
  createdAt: DateTime.utc(2026, 10),
  labels: jsonEncode({
    'synthetic-product|synthetic-unit|synthetic-warehouse': 'Fixture item',
  }),
);

InventorySaleOperation get sentinel => operation(
  'actor-sentinel',
  'workspace-sentinel',
  '00000000-0000-4000-8000-000000000004',
  run: '$_run-sentinel',
);

Future<void> exercise(String? phase, {InventorySaleJournal? journal}) async {
  // No mock adapter, sessions, controller transport, provider or network client.
  final active = journal ?? InventorySaleJournal();
  final expected = records;
  final unrelated = sentinel;
  Future<void> checkSentinel() async => require(
    (await active.read(unrelated.actor, unrelated.workspace))?.encode() ==
        unrelated.encode(),
    'Unrelated-run sentinel changed or removed',
  );
  if (phase == 'write') {
    require(
      await active.read(unrelated.actor, unrelated.workspace) == null,
      'Sentinel storage must begin empty',
    );
    await active.write(unrelated);
    await checkSentinel();
    for (final record in expected) {
      require(
        await active.read(record.actor, record.workspace) == null,
        'Fixture storage must begin empty',
      );
      await active.write(record);
      require(
        (await active.read(record.actor, record.workspace))?.encode() ==
            record.encode(),
        'Native write/readback mismatch',
      );
    }
  } else if (phase == 'read' || phase == 'cleanup') {
    await checkSentinel();
    // Read A, B and A in a new process; scope pairs and exact bytes all differ.
    for (final index in [0, 1, 0, 2, 0]) {
      final record = expected[index];
      final restored = await active.read(record.actor, record.workspace);
      require(
        restored?.encode() == record.encode(),
        'Restart or actor/workspace isolation mismatch',
      );
      require(
        restored?.payload['inventory_request_id'] == record.requestId,
        'Original request identity lost',
      );
    }
    require(
      await active.read(expected[1].actor, expected[2].workspace) == null,
      'Absent actor/workspace scope exposed another record',
    );
    var blocked = false;
    try {
      await active.acknowledge(
        expected[0].actor,
        expected[0].workspace,
        'synthetic-invoice',
      );
    } on StateError {
      blocked = true;
    }
    require(blocked, 'Unresolved native record could be removed');
    require(
      (await active.read(expected[0].actor, expected[0].workspace))?.encode() ==
          expected[0].encode(),
      'Unresolved record changed',
    );
    if (phase == 'cleanup') {
      for (final record in expected) {
        // Only this run's synthetic records are ever removed.
        await active.write(record.confirmed('synthetic-invoice'));
        await active.acknowledge(
          record.actor,
          record.workspace,
          'synthetic-invoice',
        );
      }
      await checkSentinel();
    }
  } else if (phase == 'verify-clean') {
    await checkSentinel();
    for (final record in expected) {
      require(
        await active.read(record.actor, record.workspace) == null,
        'Acknowledged synthetic record survived removal',
      );
    }
    // Separate final housekeeping only after proving the other run survived.
    await active.write(unrelated.confirmed('sentinel-invoice'));
    await active.acknowledge(
      unrelated.actor,
      unrelated.workspace,
      'sentinel-invoice',
    );
  } else {
    throw StateError('Unknown fixture phase');
  }
}
