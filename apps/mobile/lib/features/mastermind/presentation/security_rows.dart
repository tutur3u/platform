import 'package:mobile/features/mastermind/model/snapshot.dart';

/// At most one security row for a whole list (SB-100 S3).
///
/// Security rows carry the constant "Mastermind" label, so rows for different
/// products would read identically; one line says all there is to say, with no
/// count. Keeps the first one in snapshot order.
List<SecurityItem> singleSecurityRow(Iterable<Object?> items) {
  for (final item in items) {
    if (item is SecurityItem) return [item];
  }
  return const [];
}

/// [events] with every security event after the first dropped, so the feed
/// never repeats the same fixed line. [events] must already be in display
/// order; the kept one is the first, which is the most recent.
List<SnapshotEvent> singleSecurityEvent(Iterable<SnapshotEvent> events) {
  var seenSecurity = false;
  return [
    for (final event in events)
      if (event.payload is! SecurityItem || !seenSecurity)
        () {
          if (event.payload is SecurityItem) seenSecurity = true;
          return event;
        }(),
  ];
}
