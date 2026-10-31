import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';

/// The Inbox segments. The default segment is never written to the URL; the
/// others ride in `?segment=`.
///
/// Chat (Iris) exists only while the Iris flag is on, and is then first and
/// the default. Needs you and Resolved filter the same asks; Decisions is the
/// journal of what Mastermind decided on its own.
enum InboxSegment {
  chat('chat'),
  needsYou('needs-you'),
  resolved('resolved'),
  decisions('decisions');

  const InboxSegment(this.queryValue);

  final String queryValue;

  /// Lists asks (open or resolved), so search and the product filter apply.
  bool get listsAsks => this == needsYou || this == resolved;
}

/// Chat while Iris is on, otherwise Needs you.
InboxSegment get defaultInboxSegment =>
    mastermindIrisEnabled ? InboxSegment.chat : InboxSegment.needsYou;

/// The segments the Inbox offers right now, in display order.
List<InboxSegment> get availableInboxSegments => [
  for (final segment in InboxSegment.values)
    if (segment != InboxSegment.chat || mastermindIrisEnabled) segment,
];

/// The segment a `?segment=` query names; anything else (including Chat with
/// Iris off) is the default segment.
InboxSegment inboxSegmentFromQuery(String? value) {
  for (final segment in availableInboxSegments) {
    if (segment.queryValue == value) return segment;
  }
  return defaultInboxSegment;
}

/// The Inbox location for [segment]. The segment lives in the URL so a Home
/// link can open it, and switching is a `go`, never a push, so Back does not
/// walk the segments.
String inboxLocation({InboxSegment segment = InboxSegment.needsYou}) => Uri(
  path: Routes.mastermindInbox,
  queryParameters: segment == defaultInboxSegment
      ? null
      : {'segment': segment.queryValue},
).toString();
