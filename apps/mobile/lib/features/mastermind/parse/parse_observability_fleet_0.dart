part of 'snapshot_parser.dart';

Fleet parseFleet(JsonReader r) {
  r.keys(
    ['coverage', 'counts', 'series', 'tree'],
    ['coverage', 'counts', 'series', 'tree'],
  );
  return Fleet(
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    counts: r.field('counts').list(parseFleetCount, maxItems: 5),
    series: r.field('series').list(parseFleetPoint, maxItems: 673),
    tree: r.field('tree').list(parseFleetTree, maxItems: 5000),
  );
}

FleetCount parseFleetCount(JsonReader r) {
  r.keys(
    ['role', 'top_level', 'depth_1', 'depth_2_plus'],
    ['role', 'top_level', 'depth_1', 'depth_2_plus'],
  );
  return FleetCount(
    role: r.field('role').enumOf<Role>(Role.values, (v) => v.wireName),
    topLevel: r.field('top_level').integer(min: 0),
    depth1: r.field('depth_1').integer(min: 0),
    depth2Plus: r.field('depth_2_plus').integer(min: 0),
  );
}

FleetPoint parseFleetPoint(JsonReader r) {
  r.keys(
    ['t', 'running', 'waiting', 'idle', 'unknown'],
    ['t', 'running', 'waiting', 'idle', 'unknown'],
  );
  return FleetPoint(
    t: r.field('t').utcTimestamp(),
    running: r.field('running').integer(min: 0),
    waiting: r.field('waiting').integer(min: 0),
    idle: r.field('idle').integer(min: 0),
    unknown: r.field('unknown').integer(min: 0),
  );
}
