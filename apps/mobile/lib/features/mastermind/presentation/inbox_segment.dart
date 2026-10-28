import 'package:mobile/core/router/routes.dart';

/// The Inbox segments. Needs you is the default and is never written to the
/// URL; the others ride in `?segment=`.
///
/// Needs you, Resolved and All filter the same asks; Decisions is the journal
/// of what Mastermind decided on its own.
enum InboxSegment {
  needsYou('needs-you'),
  resolved('resolved'),
  all('all'),
  decisions('decisions');

  const InboxSegment(this.queryValue);

  final String queryValue;

  /// Lists asks (open or resolved), so search and the product filter apply.
  bool get listsAsks => this != decisions;
}

/// The segment a `?segment=` query names; anything else is Needs you.
InboxSegment inboxSegmentFromQuery(String? value) {
  for (final segment in InboxSegment.values) {
    if (segment.queryValue == value) return segment;
  }
  return InboxSegment.needsYou;
}

/// The Inbox location for [segment]. The segment lives in the URL so a Home
/// link can open it, and switching is a `go`, never a push, so Back does not
/// walk the segments.
String inboxLocation({InboxSegment segment = InboxSegment.needsYou}) => Uri(
  path: Routes.mastermindInbox,
  queryParameters: segment == InboxSegment.needsYou
      ? null
      : {'segment': segment.queryValue},
).toString();
