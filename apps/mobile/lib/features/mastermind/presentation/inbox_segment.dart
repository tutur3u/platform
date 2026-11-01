import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';

/// The Inbox segments. The default segment is never written to the URL; the
/// others ride in `?segment=`.
///
/// Chat (Iris) exists only while the Iris flag is on, and is then first.
/// Needs you is always the default, even with Iris on, so the decisions are
/// never hidden behind Chat. Needs you and Resolved filter the same asks;
/// Decisions is the journal of what Mastermind decided on its own.
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

/// Needs you, with Iris on or off.
InboxSegment get defaultInboxSegment => InboxSegment.needsYou;

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

/// The tier a `?tier=` query names; anything else is null (no scroll target).
InboxTier? inboxTierFromQuery(String? value) {
  for (final tier in InboxTier.values) {
    if (tier.queryValue == value) return tier;
  }
  return null;
}

/// The search text a `?q=` query carries, trimmed; null when blank.
String? inboxSearchFromQuery(String? value) {
  final text = value?.trim() ?? '';
  return text.isEmpty ? null : text;
}

/// The Inbox location for [segment]. The segment lives in the URL so a Home
/// link can open it, and switching is a `go`, never a push, so Back does not
/// walk the segments. [tier] only rides with the Needs you segment, where the
/// tiers exist, and [search] only with the segments that list asks.
String inboxLocation({
  InboxSegment segment = InboxSegment.needsYou,
  InboxTier? tier,
  String? search,
}) {
  final text = inboxSearchFromQuery(search);
  final query = {
    if (segment != defaultInboxSegment) 'segment': segment.queryValue,
    if (tier != null && segment == InboxSegment.needsYou)
      'tier': tier.queryValue,
    if (text != null && segment.listsAsks) 'q': text,
  };
  return Uri(
    path: Routes.mastermindInbox,
    queryParameters: query.isEmpty ? null : query,
  ).toString();
}
