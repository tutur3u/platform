part of 'snapshot_parser.dart';

bool _security(JsonReader r) =>
    r.field('title').value == 'Security issue' &&
    r.object().keys.every(
      (key) => const {'title', 'severity', 'state', 'product'}.contains(key),
    );

NeedsYouItem parseNeedsYouItem(JsonReader r) =>
    _security(r) ? parseSecurityItem(r) : parseNeedsYou(r);

NeedsYouItem parseOpenNeedsYou(JsonReader r) {
  if (r.field('state').value != 'open') r.field('state').fail();
  return parseNeedsYouItem(r);
}

LaneItem parseLaneItem(JsonReader r) =>
    _security(r) ? parseSecurityItem(r) : parseLane(r);

BacklogEntry parseBacklogEntry(JsonReader r) =>
    _security(r) ? parseSecurityItem(r) : parseBacklogItem(r);

Decision parseDecision(JsonReader r) {
  final security =
      r.field('area').value == 'security' &&
      r.field('title').value == 'Security fix' &&
      r.object().keys.every(
        (key) => const {
          'id',
          'at',
          'title',
          'area',
          'risk',
          'product',
        }.contains(key),
      );
  return security ? parseSecurityDecision(r) : parseJournalDecision(r);
}

EventPayload parseEventPayload(String kind, JsonReader r) => switch (kind) {
  'needs_you' || 'decision' => parseNeedsYouItem(r),
  'lane' => parseLaneItem(r),
  'backlog' => parseBacklogEntry(r),
  'product' => parseProductRelease(r),
  'quota' => parseProductQuota(r),
  'environment' => parseEnvironmentRow(r),
  'receipt' => parseReceipt(r),
  _ => r.fail(),
};
