part of 'snapshot_parser.dart';

FleetTree parseFleetTree(JsonReader r) {
  r.keys(
    ['label', 'product', 'threads', 'children', 'grandchildren'],
    ['label', 'product', 'threads', 'children', 'grandchildren'],
  );
  return FleetTree(
    label: r.field('label').enumOf<Role>(Role.values, (v) => v.wireName),
    product: r
        .field('product')
        .enumOf<Product>(Product.values, (v) => v.wireName),
    threads: r.field('threads').integer(min: 0),
    children: r.field('children').integer(min: 0),
    grandchildren: r.field('grandchildren').integer(min: 0),
  );
}

Coordination parseCoordination(JsonReader r) {
  r.keys(
    ['coverage', 'messages', 'latency', 'queue', 'failures'],
    ['coverage', 'messages', 'latency', 'queue', 'failures'],
  );
  return Coordination(
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    messages: r.field('messages').list(parseMessagePoint, maxItems: 4225),
    latency: r.field('latency').list(parseLatencyPoint, maxItems: 169),
    queue: r.field('queue').list(parseQueuePoint, maxItems: 673),
    failures: r.field('failures').list(parseFailurePoint, maxItems: 507),
  );
}

MessagePoint parseMessagePoint(JsonReader r) {
  r.keys(
    ['t', 'sender_role', 'receiver_role', 'count'],
    ['t', 'sender_role', 'receiver_role', 'count'],
  );
  return MessagePoint(
    t: r.field('t').utcTimestamp(),
    senderRole: r
        .field('sender_role')
        .enumOf<Role>(Role.values, (v) => v.wireName),
    receiverRole: r
        .field('receiver_role')
        .enumOf<Role>(Role.values, (v) => v.wireName),
    count: r.field('count').integer(min: 0),
  );
}
