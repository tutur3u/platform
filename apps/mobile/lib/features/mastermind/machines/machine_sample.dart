import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/machines/machine_parser.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';

/// The release compiler removes the sample branch even with a dart-define.
final machineSampleEnabled = ValueNotifier<bool>(
  kDebugMode && const bool.fromEnvironment('MASTERMIND_MACHINES_SAMPLE'),
);
MachineSnapshot visibleMachines(MachineSnapshot real) =>
    kDebugMode && machineSampleEnabled.value
    ? parseMachineSnapshot(machineSample)
    : real;

const machineSample = <String, dynamic>{
  'machines_meta': {'collected_at': '2026-10-29T04:00:00Z', 'coverage': 'ok'},
  'machines': [
    {
      'id': 'm-000000000001',
      'display_name': 'SSET Mac Studio',
      'role': 'studio',
      'status': 'online',
      'last_seen_at': '2026-10-29T04:00:00Z',
      'specs': {
        'os_family': 'macos',
        'cores': 32,
        'ram_gb': 512,
        'disk_gb': 1000,
      },
      'metrics': {
        't': '2026-10-29T04:00:00Z',
        'cpu_pct': 34,
        'ram_pct': 48,
        'disk_free_pct': 61,
        'disk_free_gb': 610,
        'swap_gb': 0,
        'temp_c': 54,
        'thermal': 'nominal',
      },
      'scheduling': {'state': 'active'},
      'rules': ['light_work_only'],
      'running': [
        {
          'kind': 'lane',
          'product': 'tuturuuu',
          'count': 3,
          'oldest_age_seconds': 7200,
          'lane_ids': ['lane-sample'],
        },
      ],
      'series': {
        'cpu': 'sample-cpu',
        'ram': 'sample-ram',
        'disk': 'sample-disk',
      },
      'alerts': <Object?>[],
    },
    {
      'id': 'm-000000000002',
      'display_name': 'Build Mac A',
      'role': 'build',
      'status': 'online',
      'specs': {'os_family': 'macos'},
      'metrics': {'cpu_pct': 82, 'disk_free_pct': 3},
      'alerts': [
        {'code': 'disk_low', 'level': 'critical'},
      ],
    },
    {
      'id': 'm-000000000003',
      'display_name': 'Production host',
      'role': 'prod_host',
      'status': 'online',
      'rules': ['prod_host_read_only', 'never_builds'],
    },
    {
      'id': 'm-000000000004',
      'display_name': 'Devbox',
      'role': 'devbox',
      'status': 'offline',
      'last_seen_at': '2026-10-28T14:00:00Z',
      'metrics': {'cpu_pct': 12, 'disk_free_pct': 35},
    },
  ],
  'observability': {
    'machine_series': [
      {
        'id': 'sample-cpu',
        'points': [
          {'t': '2026-10-28T04:00:00Z', 'value': 20},
          {'t': '2026-10-29T03:45:00Z', 'value': 35},
          {'t': '2026-10-29T04:00:00Z', 'value': 34},
        ],
      },
      {
        'id': 'sample-ram',
        'points': [
          {'t': '2026-10-28T04:00:00Z', 'value': 40},
          {'t': '2026-10-29T03:45:00Z', 'value': 47},
          {'t': '2026-10-29T04:00:00Z', 'value': 48},
        ],
      },
      {
        'id': 'sample-disk',
        'points': [
          {'t': '2026-10-28T04:00:00Z', 'value': 65},
          {'t': '2026-10-29T03:45:00Z', 'value': 62},
          {'t': '2026-10-29T04:00:00Z', 'value': 61},
        ],
      },
    ],
  },
};
