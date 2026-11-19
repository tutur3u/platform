'use strict';

// Pure scheduling for `bun fleet:ci`: hosts pull the heaviest shard they may
// run. A host with builds: false never receives a building shard, and a shard
// no admitted host can run is reported instead of silently dropped.

function canRun(host, shard) {
  return (
    host.slots > 0 &&
    (!shard.builds || host.builds) &&
    (shard.needs ?? []).every((need) => host.capabilities?.includes(need))
  );
}

/** Take the heaviest pending shard this host may run, or null. */
function takeShard(host, pending) {
  let best = -1;
  for (let index = 0; index < pending.length; index++) {
    if (!canRun(host, pending[index])) continue;
    if (best < 0 || pending[index].weight > pending[best].weight) best = index;
  }
  return best < 0 ? null : pending.splice(best, 1)[0];
}

/** Shards that no admitted host can run. */
function unplaceable(hosts, shards) {
  return shards.filter((shard) => !hosts.some((host) => canRun(host, shard)));
}

// Speed factor per host relative to the weights (minutes on a fast host).
function hostSpeed(host) {
  return host.speed ?? 1;
}

/** Simulate the dynamic queue to preview placement and the critical path. */
function simulate(hosts, shards) {
  const pending = [...shards];
  const lanes = hosts.flatMap((host) =>
    Array.from({ length: host.slots }, (_, slot) => ({ host, slot, at: 0 }))
  );
  const placed = [];
  for (;;) {
    const ready = lanes
      .filter((lane) => pending.some((shard) => canRun(lane.host, shard)))
      .sort((a, b) => a.at - b.at || hostSpeed(b.host) - hostSpeed(a.host));
    if (!ready.length) break;
    const lane = ready[0];
    const shard = takeShard(lane.host, pending);
    const minutes = shard.weight / hostSpeed(lane.host);
    placed.push({
      shard: shard.id,
      host: lane.host.id,
      start: lane.at,
      end: lane.at + minutes,
    });
    lane.at += minutes;
  }
  return {
    placed,
    unplaced: pending.map((shard) => shard.id),
    minutes: placed.reduce((max, item) => Math.max(max, item.end), 0),
  };
}

module.exports = { canRun, simulate, takeShard, unplaceable };
