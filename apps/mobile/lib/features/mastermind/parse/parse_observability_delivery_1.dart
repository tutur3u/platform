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

Security parseSecurity(JsonReader r) {
  r.keys(
    ['coverage', 'register', 'series', 'time_to_fix'],
    ['coverage', 'register', 'series', 'time_to_fix'],
  );
  return Security(
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    register: r
        .field('register')
        .list(parseSecurityRegisterEntry, maxItems: 385),
    series: r.field('series').list(parseSecurityPoint, maxItems: 5000),
    timeToFix: r.field('time_to_fix').list(parseTimeToFixPoint, maxItems: 5000),
  );
}
