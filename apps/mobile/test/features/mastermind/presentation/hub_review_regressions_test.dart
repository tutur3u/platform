import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';
import '../../../helpers/mastermind_usage_fixture.dart';

Map<String, dynamic> _root() => MastermindSnapshotBuilder.defaults().toJson();
Map<String, dynamic> _map(Object? raw) => raw! as Map<String, dynamic>;
Map<String, dynamic> _item(Map<String, dynamic> root) =>
    _map((_map(root['now'])['needs_you'] as List).first);

void main() {
  setUpAll(initializeDateFormatting);
  final l10n = AppLocalizationsEn();
  test(
    'lane thread_id, future keys and field envelopes coexist with staff',
    () {
      final root = _root();
      _map((root['lanes'] as List).first).addAll({
        'thread_id': 'thread-123',
        'name': 'Atlas',
        'status': 'waiting',
        'future_metadata': {'revision': 2},
        'age_seconds': {
          'value': null,
          'status': 'not_published',
          'checked_at': null,
        },
      });
      final obs = _map(root['observability']);
      _map((obs['staff'] as List).first).addAll({
        'thread_id': 'thread-staff',
        'name': 'Atlas',
        'status': 'idle',
        'future_metadata': true,
      });
      final snapshot = parsedSnapshot(root);
      expect(snapshot.lanes.whereType<Lane>().first.state, LaneState.waiting);
      expect(snapshot.lanes.whereType<Lane>().first.ageSeconds, isNull);
      expect(snapshot.observability.staff.first.state, LaneState.idle);
    },
  );

  test('history skips invalid rows, dedupes and keeps the last twenty', () {
    final root = _root();
    final item = _item(root);
    root['decisions'] = [
      {...item, 'status': 'open'},
      {'id': 'item-ffffffffffffffffffff', 'status': 'open'},
    ];
    root['decisions_resolved'] = [
      for (var i = 1; i <= 21; i++)
        {
          ...item,
          'id': 'item-${i.toRadixString(16).padLeft(20, '0')}',
          'status': 'resolved',
        },
      {...item, 'status': 'resolved', 'ask_text': 'Latest resolution'},
      {...item, 'id': 'd_123456789012'},
      {...item, 'options': null},
      {...item}..remove('version_hash'),
      {...item, 'thread_id': 'unexpected'},
      null,
    ];
    final snapshot = parsedSnapshot(root);
    expect(snapshot.resolvedItems, hasLength(20));
    expect(snapshot.resolvedItems.map((row) => row.id).toSet(), hasLength(20));
    expect(snapshot.resolvedItems.last.id, item['id']);
    expect(snapshot.resolvedItems.last.body, 'Latest resolution');
    expect(
      snapshot.now.needsYou.whereType<NeedsYou>().where(
        (row) => row.id == item['id'],
      ),
      isEmpty,
    );
  });

  test('status-only native open item is accepted', () {
    final root = _root();
    final item = _item(root)..remove('state');
    item['status'] = 'open';
    final snapshot = parsedSnapshot(root);
    expect(
      snapshot.now.needsYou.whereType<NeedsYou>().first.state,
      ItemState.open,
    );
  });

  test('checked timestamps use GMT+7 for stale and other statuses', () {
    final stale = HubField.parse({
      'value': null,
      'status': 'stale',
      'checked_at': '2026-10-28T05:45:00Z',
    });
    expect(stale.reason(l10n), 'Last checked 12:45');
    expect(stale.reason(AppLocalizationsVi()), 'Kiểm tra lần cuối 12:45');
    expect(
      HubField.parse({
        'value': null,
        'status': 'source_down',
        'checked_at': '2026-10-28T05:45:00Z',
      }).reason(l10n),
      'Source down · Last checked 12:45',
    );
    expect(
      HubField.parse({'value': null, 'status': 'stale'}).reason(l10n),
      'Stale',
    );
  });

  test('chart semantics summary includes gap bounds and reason', () {
    final series = usageSeries('Claude pool B');
    final root = usageJson(instances: [series.last], series: series);
    _map(_map(root['observability'])['usage'])['gaps'] = [
      {
        'start': series.first['t'],
        'end': series.last['t'],
        'reason': 'no_samples',
      },
    ];
    final model = MastermindUsageModel.from(parsedSnapshot(root));
    final spec = usageChartSpec(
      l10n,
      model,
      usageChartId(UsageChartKind.budget, 'Claude pool B'),
    )!;
    expect(spec.summary, contains('Gap 00:00–00:30: No samples published'));
    expect(spec.bands.first.label, 'No samples published');
  });
}
