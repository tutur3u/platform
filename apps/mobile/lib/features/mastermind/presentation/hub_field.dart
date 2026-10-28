import 'package:mobile/l10n/l10n.dart';

/// Forge v1 envelope; legacy hubs send the value directly.
final class HubField {
  const HubField(this.value, this.status, this.checkedAt);

  factory HubField.parse(Object? raw) {
    if (raw is Map<String, dynamic> && raw.containsKey('value')) {
      return HubField(
        raw['value'],
        raw['status'] is String ? raw['status'] as String : 'not_published',
        DateTime.tryParse('${raw['checked_at']}'),
      );
    }
    return HubField(raw, raw == null ? 'not_published' : 'ok', null);
  }

  final Object? value;
  final String status;
  final DateTime? checkedAt;

  String reason(AppLocalizations l10n) => switch (status) {
    'not_connected' => l10n.mastermindNotConnected,
    'source_down' => l10n.mastermindSourceDown,
    'stale' => l10n.mastermindCoverageStale,
    _ => l10n.mastermindNotPublished,
  };

  static String text(AppLocalizations l10n, String? value) =>
      value == null || value.trim().isEmpty || value.toLowerCase() == 'unknown'
      ? l10n.mastermindNotPublished
      : value;
}
