part of 'snapshot_parser.dart';

DeliveryCiPoint parseDeliveryCiPoint(JsonReader r) {
  r.keys(
    ['t', 'repo', 'queued', 'running'],
    ['t', 'repo', 'queued', 'running'],
  );
  return DeliveryCiPoint(
    t: r.field('t').utcTimestamp(),
    repo: r
        .field('repo')
        .enumOf<RepositoryName>(RepositoryName.values, (v) => v.wireName),
    queued: r.field('queued').nullable((v) => v.integer(min: 0)),
    running: r.field('running').nullable((v) => v.integer(min: 0)),
  );
}

OpenPrPoint parseOpenPrPoint(JsonReader r) {
  r.keys(['t', 'product', 'count'], ['t', 'product', 'count']);
  return OpenPrPoint(
    t: r.field('t').utcTimestamp(),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    count: r.field('count').nullable((v) => v.integer(min: 0)),
  );
}
