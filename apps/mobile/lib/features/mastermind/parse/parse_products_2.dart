part of 'snapshot_parser.dart';

SpeedPoint parseSpeedPoint(JsonReader r) {
  r.keys(['model', 't', 'tok_s_p50'], ['model', 't', 'tok_s_p50']);
  return SpeedPoint(
    model: r.field('model').string(maxLength: 100),
    t: r.field('t').utcTimestamp(),
    tokSP50: r.field('tok_s_p50').number(min: 0),
  );
}

ChildrenPoint parseChildrenPoint(JsonReader r) {
  r.keys(
    ['t', 'provider', 'model', 'running', 'started', 'finished'],
    ['t', 'provider', 'model', 'running', 'started', 'finished'],
  );
  return ChildrenPoint(
    t: r.field('t').utcTimestamp(),
    provider: r.field('provider').stringIn(ChildrenProviders.all),
    model: r.field('model').string(maxLength: 100),
    running: r.field('running').integer(min: 0),
    started: r.field('started').integer(min: 0),
    finished: r.field('finished').integer(min: 0),
  );
}

Staff parseStaff(JsonReader r) {
  r.keys(
    ['role', 'title', 'state', 'model'],
    ['role', 'title', 'state', 'model'],
  );
  return Staff(
    role: r.field('role').string(maxLength: 80),
    title: r.field('title').string(maxLength: 80),
    state: r
        .field('state')
        .enumOf<LaneState>(LaneState.values, (v) => v.wireName),
    model: r.field('model').string(maxLength: 100),
  );
}
