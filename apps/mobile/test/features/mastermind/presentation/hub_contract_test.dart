import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/hub_contract_adapter.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

void main() {
  final l10n = AppLocalizationsEn();
  test('v1 resolved collections remove open duplicate by stable item ID', () {
    final root = MastermindSnapshotBuilder.defaults().toJson();
    final now = root['now'] as Map<String, dynamic>;
    final item = (now['needs_you'] as List).first as Map<String, dynamic>;
    root['decisions_resolved'] = [
      {...item, 'status': 'resolved', 'ask_text': 'Full decision ask'},
    ];
    final parsed = parseMastermindSnapshot(
      Uint8List.fromList(utf8.encode(jsonEncode(root))),
    );
    expect(parsed, isA<ParseAccepted>());
    final snapshot = (parsed as ParseAccepted).snapshot;
    expect(
      snapshot.now.needsYou.whereType<NeedsYou>().where(
        (row) => row.id == item['id'],
      ),
      isEmpty,
    );
    expect(snapshot.resolvedItems.single.body, 'Full decision ask');
  });
  test(
    'inferred gaps use no samples, with reset evidence taking precedence',
    () {
      final start = DateTime.utc(2026, 10, 28);
      UsagePoint point(int minute, {DateTime? reset}) => UsagePoint(
        instance: 'Claude pool B',
        t: start.add(Duration(minutes: minute)),
        session: UsageWindow(
          remainingPercent: 50,
          resetsAt: reset,
          burnPercentPerHour: null,
          projectedRemainingAtReset: null,
          pacing: null,
        ),
        weekly: const UsageWindow(
          remainingPercent: null,
          resetsAt: null,
          burnPercentPerHour: null,
          projectedRemainingAtReset: null,
          pacing: null,
        ),
      );
      final samples = [point(0), point(15), point(285), point(300)];
      expect(usageGaps(samples, []).single.reason, 'no_samples');
      samples[1] = point(15, reset: start.add(const Duration(hours: 2)));
      expect(usageGaps(samples, []).single.reason, 'reset');
    },
  );
  test('legacy fields and Forge envelopes retain values and reasons', () {
    expect(HubField.parse(28).value, 28);
    expect(HubField.parse(null).reason(l10n), 'Not published yet');
    final field = HubField.parse({
      'value': null,
      'status': 'source_down',
      'checked_at': '2026-10-28T05:45:00Z',
    });
    expect(field.reason(l10n), 'Source down');
    expect(field.checkedAt, DateTime.utc(2026, 10, 28, 5, 45));
    expect(HubField.text(l10n, 'unknown'), 'Not published yet');
    expect(HubField.text(l10n, 'running'), 'running');
  });
  test('resolved decision preserves identity and replaces placeholder ask', () {
    final legacy = {'id': 'item-123', 'body': 'Old ask', 'state': 'open'};
    expect(adaptDecision(legacy), legacy);
    final adapted = adaptDecision({
      ...legacy,
      'status': 'resolved',
      'ask_text': 'Full ask',
      'resolved_at': '2026-10-28T05:45:00Z',
    });
    expect(adapted['state'], 'answered');
    expect(adapted['body'], 'Full ask');
    expect(adapted['id'], legacy['id']);
    expect(legacy['state'], 'open');
  });
  test('gap markers classify Forge reasons and tolerate missing reason', () {
    for (final entry in {
      'source_down': 'Source down',
      'account_switch': 'Account switched',
      'reset': 'Quota reset',
      'no_samples': 'No samples published',
      'future_reason': 'No samples published',
    }.entries) {
      final gap = UsageGap.parse({
        'start': '2026-10-28T05:45:00Z',
        'end': '2026-10-28T10:15:00Z',
        'reason': entry.key,
      });
      expect(gap!.label(l10n), entry.value);
    }
    expect(UsageGap.parse({'start': 'bad', 'end': 'bad'}), isNull);
  });
}
