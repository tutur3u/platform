'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Fleet hosts for `bun fleet:ci`. The production server is never a target:
// every alias that resolves to it is refused before any SSH connection.
const REFUSED_HOSTS = new Set([
  'skr-linux',
  'skr-linux-lan',
  'sokora-ubuntu',
  'pktm-prod',
]);

// Host shape: { id, ssh, repo, slots, builds, minFreeGiB, ttrRuntime? }.
// slots: concurrent shards; builds: may run shards that build packages;
// minFreeGiB: refuse the host when the repository volume has less free space;
// keep it at or above the host's own `ttr resources` heavy-admission floor;
// ttrRuntime: absolute runtime that host's ttr must run on, when its shims
// are pinned. Machine-specific hosts live outside the repository in
// $FLEET_CI_HOSTS or ~/.tuturuuu/fleet-ci/hosts.json (a JSON array).
const LOCAL_HOST = {
  id: 'local',
  ssh: null,
  repo: null,
  slots: 1,
  builds: false,
  minFreeGiB: 24,
};
const DEFAULT_HOSTS = [LOCAL_HOST];

function hostConfigPath(env = process.env) {
  return (
    env.FLEET_CI_HOSTS ||
    path.join(os.homedir(), '.tuturuuu', 'fleet-ci', 'hosts.json')
  );
}

/** Configured remote hosts plus the local host (unless the file defines one). */
function loadHostConfig(file = hostConfigPath(), fsImpl = fs) {
  if (!fsImpl.existsSync(file)) return DEFAULT_HOSTS;
  const hosts = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  if (!Array.isArray(hosts)) throw new Error(`${file} must hold a JSON array`);
  return hosts.some((host) => host?.id === LOCAL_HOST.id)
    ? hosts
    : [...hosts, LOCAL_HOST];
}

function isRefusedHost(name) {
  const value = String(name ?? '')
    .toLowerCase()
    .replace(/^.*@/u, '');
  return [...REFUSED_HOSTS].some(
    (refused) => value === refused || value.startsWith(`${refused}.`)
  );
}

function validateHost(host) {
  if (!host || typeof host.id !== 'string' || !/^[\w.-]+$/u.test(host.id))
    throw new Error('Each fleet host needs an id of letters, digits, . _ -');
  for (const name of [host.id, host.ssh])
    if (isRefusedHost(name))
      throw new Error(`Refusing fleet host ${name}: production server.`);
  if (host.ssh !== null && !/^[\w.@-]+$/u.test(host.ssh ?? ''))
    throw new Error(`Fleet host ${host.id} has an invalid ssh alias.`);
  if (host.ssh !== null && !/^\/[^\0'"`$\\]+$/u.test(host.repo ?? ''))
    throw new Error(`Fleet host ${host.id} needs an absolute repo path.`);
  if (host.ttrRuntime !== undefined && !/^\/[\w./-]+$/u.test(host.ttrRuntime))
    throw new Error(`Fleet host ${host.id} has an invalid ttrRuntime.`);
  if (!Number.isInteger(host.slots) || host.slots < 0 || host.slots > 16)
    throw new Error(`Fleet host ${host.id} needs 0..16 slots.`);
  return {
    builds: false,
    minFreeGiB: 25,
    ...host,
  };
}

/** Resolve the host list from defaults, an optional JSON file and --hosts. */
function resolveHosts({ config, only } = {}) {
  const hosts = (config ?? loadHostConfig()).map(validateHost);
  if (!only?.length) return hosts;
  for (const id of only)
    if (isRefusedHost(id))
      throw new Error(`Refusing fleet host ${id}: production server.`);
  const selected = hosts.filter((host) => only.includes(host.id));
  const missing = only.filter((id) => !hosts.some((host) => host.id === id));
  if (missing.length)
    throw new Error(`Unknown fleet host(s): ${missing.join(', ')}`);
  return selected;
}

module.exports = {
  DEFAULT_HOSTS,
  LOCAL_HOST,
  hostConfigPath,
  isRefusedHost,
  loadHostConfig,
  resolveHosts,
  validateHost,
};
