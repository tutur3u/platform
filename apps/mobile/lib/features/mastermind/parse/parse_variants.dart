part of 'snapshot_parser.dart';

/// A security row is exactly `{title, state, product?}`. Anything else with
/// that title (for example a retired `severity` key) is parsed as a regular
/// item and rejected by its strict key check.
bool _security(JsonReader r) =>
    r.field('title').value == 'Security issue' &&
    r.object().keys.every(
      (key) => const {'title', 'state', 'product'}.contains(key),
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

/// Schema 1.4 allows at most one security row per product (and one without a
/// product) in each section. A repeat is a schema violation at the repeated
/// row.
List<T> _singleSecurityPerProduct<T>(JsonReader r, List<T> items) {
  final seen = <Product?>{};
  for (var i = 0; i < items.length; i++) {
    final item = items[i];
    if (item is SecurityItem && !seen.add(item.product)) {
      JsonReader(null, '${r.path}/$i').fail();
    }
  }
  return items;
}

List<NeedsYouItem> parseOpenNeedsYouItems(JsonReader r) =>
    _singleSecurityPerProduct(r, r.list(parseOpenNeedsYou));

List<LaneItem> parseLaneItems(JsonReader r) =>
    _singleSecurityPerProduct(r, r.list(parseLaneItem));

List<BacklogEntry> parseBacklogEntries(JsonReader r) =>
    _singleSecurityPerProduct(r, r.list(parseBacklogEntry));

/// Journal decisions have a single variant in schema 1.4; a retired security
/// decision (`area: "security"`) fails the strict area enum.
Decision parseDecision(JsonReader r) => parseJournalDecision(r);

/// Event payloads never carry security rows: the events schema has no security
/// variant, and a `needs_you` or `decision` payload `kind` is only
/// `decision`, `action` or `fyi`.
EventPayload parseEventPayload(String kind, JsonReader r) => switch (kind) {
  'needs_you' || 'decision' => parseNeedsYou(r),
  'lane' => parseLane(r),
  'backlog' => parseBacklogItem(r),
  'product' => parseProductRelease(r),
  'quota' => parseProductQuota(r),
  'environment' => parseEnvironmentRow(r),
  'receipt' => parseReceipt(r),
  _ => r.fail(),
};
