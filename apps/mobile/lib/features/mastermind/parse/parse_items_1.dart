part of 'snapshot_parser.dart';

BacklogItem parseBacklogItem(JsonReader r) {
  r.keys(['id', 'title', 'state', 'product'], ['id', 'title', 'state']);
  return BacklogItem(
    id: r.field('id').string(pattern: RegExp(r'^item-[a-f0-9]{20}$')),
    title: r.field('title').string(maxLength: 100),
    state: r
        .field('state')
        .enumOf<ItemState>(ItemState.values, (v) => v.wireName),
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
  );
}

JournalDecision parseJournalDecision(JsonReader r) {
  r.keys(
    [
      'id',
      'at',
      'title',
      'area',
      'risk',
      'by',
      'category',
      'why',
      'reversible',
      'product',
    ],
    ['id', 'at', 'title', 'area', 'risk', 'by', 'category', 'reversible'],
  );
  return JournalDecision(
    id: r.field('id').string(pattern: RegExp(r'^d_[a-f0-9]{12}$')),
    at: r.field('at').utcTimestamp(),
    title: r.field('title').string(maxLength: 80),
    area: r
        .field('area')
        .enumOf<DecisionArea>(DecisionArea.values, (v) => v.wireName),
    risk: r.field('risk').enumOf<Risk>(Risk.values, (v) => v.wireName),
    by: r
        .field('by')
        .string(
          pattern: RegExp(r'^(mastermind|user|role:[a-z][a-z0-9-]{0,39})$'),
        ),
    category: r
        .field('category')
        .enumOf<DecisionCategory>(DecisionCategory.values, (v) => v.wireName),
    why: r.has('why') ? r.field('why').string(maxLength: 280) : null,
    reversible: r.field('reversible').boolean(),
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
  );
}

SecurityDecision parseSecurityDecision(JsonReader r) {
  r.keys(
    ['id', 'at', 'title', 'area', 'risk', 'product'],
    ['id', 'at', 'title', 'area', 'risk'],
  );
  return SecurityDecision(
    id: r.field('id').string(pattern: RegExp(r'^d_[a-f0-9]{12}$')),
    at: r.field('at').utcTimestamp(),
    title: r.field('title').string(constant: 'Security fix'),
    area: r.field('area').string(constant: 'security'),
    risk: r.field('risk').enumOf<Risk>(Risk.values, (v) => v.wireName),
    product: r.has('product')
        ? r.field('product').enumOf<Product>(Product.values, (v) => v.wireName)
        : null,
  );
}
