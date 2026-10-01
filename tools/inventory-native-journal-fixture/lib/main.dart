import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// CI copies this exact production source; it never substitutes storage methods.
import 'inventory_sale_journal.dart';

const _channel = MethodChannel('fixture/sale_journal');
const _run = String.fromEnvironment('FIXTURE_RUN');
const _sha = String.fromEnvironment('SOURCE_SHA');
const _sourceDigest = String.fromEnvironment('JOURNAL_SHA256');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final phase = await _channel.invokeMethod<String>('phase');
  var passed = false;
  String? error;
  try {
    require(_run.isNotEmpty && _sha.length == 40, 'Missing fixture identity');
    await exercise(phase);
    passed = true;
  } on Object {
    error = 'fixture_assertion_failed';
  }
  await _channel.invokeMethod<void>(
    'report',
    jsonEncode({
      'phase': phase,
      'passed': passed,
      'error': error,
      'run_id': _run,
      'source_sha': _sha,
      'journal_sha256': _sourceDigest,
      'request_ids': records.map((record) => record.requestId).toList(),
    }),
  );
  runApp(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: Text('Native journal $phase: ${passed ? 'PASS' : 'FAIL'}'),
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

InventorySaleOperation operation(String actor, String workspace, String id) =>
    InventorySaleOperation(
      actor: 'native-fixture:$_run:$actor',
      workspace: 'native-fixture:$_run:$workspace',
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

Future<void> exercise(String? phase) async {
  // No mock adapter, sessions, controller transport, provider or network client.
  final journal = InventorySaleJournal();
  final expected = records;
  if (phase == 'write') {
    for (final record in expected) {
      require(
        await journal.read(record.actor, record.workspace) == null,
        'Fixture storage must begin empty',
      );
      await journal.write(record);
      require(
        (await journal.read(record.actor, record.workspace))?.encode() ==
            record.encode(),
        'Native write/readback mismatch',
      );
    }
  } else if (phase == 'read' || phase == 'cleanup') {
    // Read A, B and A in a new process; scope pairs and exact bytes all differ.
    for (final index in [0, 1, 0, 2, 0]) {
      final record = expected[index];
      final restored = await journal.read(record.actor, record.workspace);
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
      await journal.read(expected[1].actor, expected[2].workspace) == null,
      'Absent actor/workspace scope exposed another record',
    );
    var blocked = false;
    try {
      await journal.acknowledge(
        expected[0].actor,
        expected[0].workspace,
        'synthetic-invoice',
      );
    } on StateError {
      blocked = true;
    }
    require(blocked, 'Unresolved native record could be removed');
    require(
      (await journal.read(
            expected[0].actor,
            expected[0].workspace,
          ))?.encode() ==
          expected[0].encode(),
      'Unresolved record changed',
    );
    if (phase == 'cleanup') {
      for (final record in expected) {
        // Only this run's synthetic records are ever removed.
        await journal.write(record.confirmed('synthetic-invoice'));
        await journal.acknowledge(
          record.actor,
          record.workspace,
          'synthetic-invoice',
        );
      }
    }
  } else if (phase == 'verify-clean') {
    for (final record in expected) {
      require(
        await journal.read(record.actor, record.workspace) == null,
        'Acknowledged synthetic record survived removal',
      );
    }
  } else {
    throw StateError('Unknown fixture phase');
  }
}
