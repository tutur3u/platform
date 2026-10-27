part of 'snapshot_parser.dart';

SecurityRegisterEntry parseSecurityRegisterEntry(JsonReader r) {
  r.keys(
    ['product', 'severity', 'status', 'count'],
    ['product', 'severity', 'status', 'count'],
  );
  return SecurityRegisterEntry(
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    severity: r
        .field('severity')
        .enumOf<Severity>(Severity.values, (v) => v.wireName),
    status: r
        .field('status')
        .enumOf<RegisterStatus>(RegisterStatus.values, (v) => v.wireName),
    count: r.field('count').integer(min: 0),
  );
}

SecurityPoint parseSecurityPoint(JsonReader r) {
  r.keys(
    ['t', 'product', 'critical_open', 'critical_closed'],
    ['t', 'product', 'critical_open', 'critical_closed'],
  );
  return SecurityPoint(
    t: r.field('t').utcTimestamp(),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    criticalOpen: r.field('critical_open').integer(min: 0),
    criticalClosed: r.field('critical_closed').integer(min: 0),
  );
}

TimeToFixPoint parseTimeToFixPoint(JsonReader r) {
  r.keys(
    ['t', 'product', 'median_hours', 'samples'],
    ['t', 'product', 'median_hours', 'samples'],
  );
  return TimeToFixPoint(
    t: r.field('t').utcTimestamp(),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    medianHours: r.field('median_hours').nullable((v) => v.number(min: 0)),
    samples: r.field('samples').integer(min: 0),
  );
}
