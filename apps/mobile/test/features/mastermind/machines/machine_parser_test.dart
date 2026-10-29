import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/machines/machine_parser.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';

Map<String, dynamic> fixture() =>
    jsonDecode(jsonEncode(machineSample)) as Map<String, dynamic>;
void main() {
  test('valid sample, closed names, grouping and nullable metrics', () {
    final data = parseMachineSnapshot(fixture());
    expect(data.machines, hasLength(4));
    expect(data.machines!.first.displayName, 'SSET Mac Studio');
    expect(data.machines!.first.history['cpu'], hasLength(3));
    expect(data.machines![2].metrics['cpu_pct'], isNull);
    final groups = groupMachines(data.machines!);
    expect(groups[MachineGroup.attention]!.single.displayName, 'Build Mac A');
    expect(groups[MachineGroup.online], hasLength(2));
    expect(groups[MachineGroup.offline]!.single.metrics['cpu_pct'], 12);
  });
  test(
    'missing differs from empty; partial and unknown enums are tolerated',
    () {
      expect(parseMachineSnapshot({}).machines, isNull);
      expect(parseMachineSnapshot({'machines': <Object?>[]}).machines, isEmpty);
      final data = parseMachineSnapshot({
        'machines_meta': {'coverage': 'partial'},
        'machines': [
          {
            'id': 'm-abcdef123456',
            'role': 'future',
            'status': 'future',
            'display_name': 'skr-secret /Users/secret 192.0.2.1',
            'aliases': ['skr-sonha', 'secret-host'],
            'metrics': {'cpu_pct': null, 'ram_pct': 101},
            'rules': ['future'],
            'alerts': [
              {'code': 'future'},
            ],
            'running': [
              {'kind': 'future'},
            ],
          },
        ],
      });
      final m = data.machines!.single;
      expect(m.displayName, 'Machine');
      expect(m.role, isNull);
      expect(m.status, isNull);
      expect(m.alerts, isEmpty);
      expect(m.running, isEmpty);
      expect(m.rules, isEmpty);
      expect(m.metrics.values.every((v) => v == null), isTrue);
      expect(data.coverage, 'partial');
    },
  );
  test('prod rule cannot be omitted and stale is time based', () {
    final data = parseMachineSnapshot({
      'machines': [
        {'id': 'm-abcdef123456', 'role': 'prod_host'},
      ],
    });
    expect(data.machines!.single.rules, contains('prod_host_read_only'));
    expect(data.stale(DateTime.utc(2026)), isTrue);
    expect(
      parseMachineSnapshot(fixture()).stale(DateTime.utc(2026, 10, 29, 4, 16)),
      isTrue,
    );
    expect(
      parseMachineSnapshot(fixture()).stale(DateTime.utc(2026, 10, 29, 4, 1)),
      isFalse,
    );
  });
  test(
    'hub parser accepts additive machines and machine_series on 1.4 and 1.5',
    () {
      for (final version in ['1.4', '1.5']) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        final sample = fixture();
        root['machines'] = sample['machines'];
        root['machines_meta'] = sample['machines_meta'];
        root['schema_version'] = version;
        (root['observability'] as Map<String, dynamic>)['machine_series'] =
            (sample['observability'] as Map<String, dynamic>)['machine_series'];
        final outcome = parseMastermindSnapshot(
          Uint8List.fromList(utf8.encode(jsonEncode(root))),
        );
        expect(outcome, isA<ParseAccepted>());
        expect(
          (outcome as ParseAccepted).snapshot.machines.machines,
          hasLength(4),
        );
      }
    },
  );
  test('committed hostile-alias fixture is sanitized', () {
    final root =
        jsonDecode(
              File(
                'test/fixtures/mastermind_machines_sample.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final machine = parseMachineSnapshot(root).machines!.first;
    expect(machine.displayName, 'SSET Mac Studio');
    expect(machine.toString(), isNot(contains('skr-sonha')));
  });
}
