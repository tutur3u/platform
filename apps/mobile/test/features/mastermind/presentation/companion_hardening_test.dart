import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/hub_companion_adapter.dart';

Map<String, dynamic> fixture() =>
    jsonDecode(
          File(
            'test/fixtures/mastermind/forge_v1_redacted.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

ParseAccepted accepted(Map<String, dynamic> raw) {
  final result = parseMastermindSnapshot(utf8.encode(jsonEncode(raw)));
  expect(
    result,
    isA<ParseAccepted>(),
    reason: result is ParseRejected ? result.path : null,
  );
  return result as ParseAccepted;
}

Map<String, dynamic> object(Object? value) => value! as Map<String, dynamic>;
List<dynamic> rows(Object? value) => value! as List<dynamic>;
Map<String, dynamic> first(Object? value) => object(rows(value).first);

void main() {
  test('Z and offset companion timestamps normalize for the strict parser', () {
    for (final stamp in ['2026-10-28T12:00:00Z', '2026-10-28T19:00:00+07:00']) {
      final raw = fixture();
      object(first(raw['ship'])['released_at'])['value'] = stamp;
      final weekly = object(first(raw['insights'])['weekly']);
      object(weekly['resets_at'])['value'] = stamp;
      final snapshot = accepted(raw).snapshot;
      expect(
        snapshot.environments.first.releasedAt,
        DateTime.utc(2026, 10, 28, 12),
      );
      expect(
        snapshot.observability.usage.instances.first.weekly.resetsAt,
        DateTime.utc(2026, 10, 28, 12),
      );
    }
  });

  test(
    'invalid companion values retain legacy values with explicit metadata',
    () {
      for (final entry in {
        'deploy_status': 'cancelled',
        'ci_state': 'skipped',
        'released_at': 'yesterday',
        'pacing': 'ready',
        'remaining_percent': 101,
        'resets_at': 'bad',
        'burn_percent_per_hour': -1,
        'projected_remaining_at_reset': 'bad',
        'age_seconds': -1,
        'eta_seconds': 'soon',
      }.entries) {
        final merged = mergeCompanion(null, {'value': entry.value}, entry.key);
        expect(merged['value'], isNull);
        expect(merged['status'], 'not_published');
        expect(merged['reason'], 'Unrecognised value');
      }
      final raw = fixture();
      object(first(raw['ship'])['deploy'])['value'] = 'cancelled';
      object(first(raw['ship'])['ci'])['value'] = 'skipped';
      object(first(raw['ship'])['released_at'])['value'] = 'bad';
      final weekly = object(first(raw['insights'])['weekly']);
      object(weekly['pacing'])['value'] = 'ready';
      first(object(raw['work'])['lanes'])['age_seconds'] = {'value': -1};
      first(object(raw['work'])['lanes'])['eta_seconds'] = {'value': 'soon'};
      final snapshot = accepted(raw).snapshot;
      expect(
        snapshot.environments.first.fields['deploy_status']!.status,
        'not_published',
      );
      expect(snapshot.lanes, hasLength(1));
    },
  );

  test(
    'ship overlays only production and preserves legacy on null or invalid',
    () {
      final raw = fixture();
      final synthesized = first(adaptHubCompanions(raw)['environments']);
      raw['environments'] = [
        {...synthesized, 'deploy_status': 'success', 'ci_state': 'success'},
        {...synthesized, 'environment': 'staging', 'deploy_status': 'pending'},
      ];
      var snapshot = accepted(raw).snapshot;
      expect(snapshot.environments.first.deployStatus.wireName, 'success');
      expect(snapshot.environments[1].deployStatus.wireName, 'pending');
      object(first(raw['ship'])['deploy'])['value'] = 'cancelled';
      snapshot = accepted(raw).snapshot;
      expect(snapshot.environments.first.deployStatus.wireName, 'success');
      expect(
        snapshot.environments.first.fields['deploy_status']!.unrecognised,
        isTrue,
      );
    },
  );

  test('bad lane and unknown decision status do not reject the snapshot', () {
    final raw = fixture();
    rows(raw['lanes']).addAll([
      {'id': 'bad'},
      null,
      'bad lane',
    ]);
    rows(raw['decisions']).add({
      ...first(raw['decisions']),
      'id': 'item-aaaaaaaaaaaaaaaaaaaa',
      'status': 'surprise',
      'state': 'surprise',
    });
    final snapshot = accepted(raw).snapshot;
    expect(snapshot.lanes, hasLength(1));
    expect(snapshot.now.needsYou, hasLength(2));
  });

  test('decisions-only resolved items reach history and leave inbox', () {
    final raw = fixture();
    first(raw['decisions'])['status'] = 'resolved';
    raw['decisions_resolved'] = <Object?>[];
    final snapshot = accepted(raw).snapshot;
    expect(snapshot.resolvedItems, hasLength(1));
    expect(snapshot.now.needsYou, hasLength(1));
  });

  test('published counts retain queued lanes or use explicit queued count', () {
    final raw = fixture();
    first(raw['lanes'])['state'] = 'queued';
    first(raw['lanes']).remove('status');
    object(raw['work'])['lanes'] = <Object?>[];
    var model = MastermindHomeModel.from(accepted(raw).snapshot);
    expect(model.lanes.queued, 1);
    object(object(raw['work'])['counts'])['queued'] = 4;
    model = MastermindHomeModel.from(accepted(raw).snapshot);
    expect(model.lanes.queued, 4);
  });
}
