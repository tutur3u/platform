part of 'snapshot_parser.dart';

LatencyPoint parseLatencyPoint(JsonReader r) {
  r.keys(
    ['t', 'median_seconds', 'samples'],
    ['t', 'median_seconds', 'samples'],
  );
  return LatencyPoint(
    t: r.field('t').utcTimestamp(),
    medianSeconds: r.field('median_seconds').nullable((v) => v.number(min: 0)),
    samples: r.field('samples').integer(min: 0),
  );
}

QueuePoint parseQueuePoint(JsonReader r) {
  r.keys(
    ['t', 'depth', 'steer', 'queue', 'start'],
    ['t', 'depth', 'steer', 'queue', 'start'],
  );
  return QueuePoint(
    t: r.field('t').utcTimestamp(),
    depth: r.field('depth').nullable((v) => v.integer(min: 0)),
    steer: r.field('steer').nullable((v) => v.integer(min: 0)),
    queue: r.field('queue').nullable((v) => v.integer(min: 0)),
    start: r.field('start').nullable((v) => v.integer(min: 0)),
  );
}

FailurePoint parseFailurePoint(JsonReader r) {
  r.keys(['t', 'cause', 'count'], ['t', 'cause', 'count']);
  return FailurePoint(
    t: r.field('t').utcTimestamp(),
    cause: r
        .field('cause')
        .enumOf<FailureCause>(FailureCause.values, (v) => v.wireName),
    count: r.field('count').integer(min: 0),
  );
}
