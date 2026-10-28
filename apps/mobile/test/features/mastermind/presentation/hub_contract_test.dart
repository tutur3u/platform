import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/hub_contract_adapter.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

void main() {
  final l10n = AppLocalizationsEn();
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
