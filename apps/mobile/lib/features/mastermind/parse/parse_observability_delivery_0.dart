part of 'snapshot_parser.dart';

Delivery parseDelivery(JsonReader r) {
  r.keys(
    ['coverage', 'ships', 'merge_to_live', 'ci', 'open_prs'],
    ['coverage', 'ships', 'merge_to_live', 'ci', 'open_prs'],
  );
  return Delivery(
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    ships: r.field('ships').list(parseShipPoint, maxItems: 49),
    mergeToLive: r
        .field('merge_to_live')
        .list(parseMergeToLivePoint, maxItems: 49),
    ci: r.field('ci').list(parseDeliveryCiPoint, maxItems: 1346),
    openPrs: r.field('open_prs').list(parseOpenPrPoint, maxItems: 5000),
  );
}

ShipPoint parseShipPoint(JsonReader r) {
  r.keys(['t', 'product', 'count'], ['t', 'product', 'count']);
  return ShipPoint(
    t: r.field('t').utcTimestamp(),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    count: r.field('count').integer(min: 0),
  );
}

MergeToLivePoint parseMergeToLivePoint(JsonReader r) {
  r.keys(
    ['t', 'product', 'median_minutes', 'samples'],
    ['t', 'product', 'median_minutes', 'samples'],
  );
  return MergeToLivePoint(
    t: r.field('t').utcTimestamp(),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    medianMinutes: r.field('median_minutes').nullable((v) => v.number(min: 0)),
    samples: r.field('samples').integer(min: 0),
  );
}
