part of 'snapshot_parser.dart';

SecurityItem parseSecurityItem(JsonReader r) {
  r.keys(['title', 'state', 'product'], ['title', 'state']);
  return SecurityItem(
    title: r.field('title').string(constant: 'Security issue'),
    state: r
        .field('state')
        .enumOf<LaneState>(LaneState.values, (v) => v.wireName),
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
  );
}

NeedsYou parseNeedsYou(JsonReader input) {
  var r = input;
  r = JsonReader(adaptDecision(r.object()), r.path);
  r.keys(
    [
      'id',
      'title',
      'body',
      'options',
      'recommended_option',
      'state',
      'version_hash',
      'ask_truncated',
      'created_at',
      'hub_title',
      'hub_text',
      'hub_options',
      'hub_recommended',
      'by',
      'kind',
      'product',
    ],
    [
      'id',
      'title',
      'body',
      'options',
      'recommended_option',
      'state',
      'version_hash',
    ],
  );
  return NeedsYou(
    id: r.field('id').string(pattern: RegExp(r'^item-[a-f0-9]{20}$')),
    title: r.field('title').string(maxLength: 100),
    body: r.field('body').string(maxLength: 2000),
    hubTitle: _shortAskText(r, 'hub_title', 100),
    hubText: _shortAskText(r, 'hub_text', 2000),
    hubRecommended: _shortAskText(r, 'hub_recommended', 80),
    by: _shortAskText(r, 'by', 100),
    hubOptions: r.has('hub_options')
        ? r
              .field('hub_options')
              .nullable(
                (v) => v.list((v) => v.string(maxLength: 80), maxItems: 8),
              )
        : null,
    askTruncated: r.object()['ask_truncated'] == true,
    createdAt: DateTime.tryParse(
      r.object()['created_at']?.toString() ?? '',
    )?.toUtc(),
    options: r
        .field('options')
        .list((v) => v.string(maxLength: 80), maxItems: 8, unique: true),
    recommendedOption: r
        .field('recommended_option')
        .nullable((v) => v.string(maxLength: 80)),
    state: r
        .field('state')
        .enumOf<ItemState>(ItemState.values, (v) => v.wireName),
    versionHash: r
        .field('version_hash')
        .string(pattern: RegExp(r'^[a-f0-9]{64}$')),
    kind: r.has('kind')
        ? r.field('kind').enumOf<ItemKind>(ItemKind.values, (v) => v.wireName)
        : null,
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
  );
}

Lane parseLane(JsonReader input) {
  var r = input;
  r = JsonReader(
    adaptThread(
      r.object(),
      fields: const {
        'id',
        'title',
        'role',
        'state',
        'provider_model',
        'age_seconds',
        'eta_seconds',
        'product',
        'area',
        'kind',
      },
    ),
    r.path,
  );
  final fields = {
    for (final e in r.object().entries) e.key: HubField.parse(e.value),
  };
  r = JsonReader({
    for (final e in fields.entries)
      e.key: e.value.value ?? (e.key == 'state' ? 'unknown' : null),
  }, r.path);
  r.keys(
    [
      'id',
      'title',
      'role',
      'state',
      'provider_model',
      'age_seconds',
      'eta_seconds',
      'product',
      'area',
      'kind',
    ],
    [
      'id',
      'title',
      'role',
      'state',
      'provider_model',
      'age_seconds',
      'eta_seconds',
    ],
  );
  return Lane(
    fields: fields,
    id: r.field('id').string(pattern: RegExp(r'^item-[a-f0-9]{20}$')),
    title: r.field('title').string(maxLength: 100),
    role: r.field('role').string(maxLength: 60),
    state: r
        .field('state')
        .enumOf<LaneState>(LaneState.values, (v) => v.wireName),
    providerModel: r.field('provider_model').string(maxLength: 100),
    ageSeconds: r.field('age_seconds').nullable((v) => v.integer(min: 0)),
    etaSeconds: r.field('eta_seconds').nullable((v) => v.integer(min: 0)),
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
    area: r.has('area')
        ? r.field('area').enumOf<Area>(Area.values, (v) => v.wireName)
        : null,
    kind: r.has('kind')
        ? r.field('kind').enumOf<LaneKind>(LaneKind.values, (v) => v.wireName)
        : null,
  );
}

/// Empty optional short copy uses the canonical fallback.
String? _shortAskText(JsonReader r, String key, int maxLength) {
  if (!r.has(key)) return null;
  final value = r.field(key).nullable((v) => v.string(maxLength: maxLength));
  return value == null || value.trim().isEmpty ? null : value;
}
