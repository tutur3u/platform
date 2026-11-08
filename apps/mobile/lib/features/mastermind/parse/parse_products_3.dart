part of 'snapshot_parser.dart';

Ci parseCi(JsonReader r) {
  r.keys(
    ['repo', 'queued', 'running', 't'],
    ['repo', 'queued', 'running', 't'],
  );
  return Ci(
    repo: r
        .field('repo')
        .enumOf<RepositoryName>(RepositoryName.values, (v) => v.wireName),
    queued: r.field('queued').nullable((v) => v.integer(min: 0)),
    running: r.field('running').nullable((v) => v.integer(min: 0)),
    t: r.field('t').utcTimestamp(),
  );
}

Cadence parseCadence(JsonReader r) {
  r.keys(['product', 'last_prod_at'], ['product', 'last_prod_at']);
  return Cadence(
    product: r
        .field('product')
        .enumOf<ReleaseProduct>(ReleaseProduct.values, (v) => v.wireName),
    lastProdAt: r.field('last_prod_at').nullable((v) => v.utcTimestamp()),
  );
}

Receipt parseReceipt(JsonReader r) {
  r.keys(['product', 'state', 'title'], ['product', 'state', 'title']);
  return Receipt(
    product: r
        .field('product')
        .enumOf<ReceiptProduct>(ReceiptProduct.values, (v) => v.wireName),
    state: r
        .field('state')
        .enumOf<ReceiptState>(ReceiptState.values, (v) => v.wireName),
    title: r.field('title').string(constant: 'Receipt recorded'),
  );
}
