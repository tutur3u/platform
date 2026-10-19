import assert from 'node:assert/strict';
import { z } from 'zod';

export type DockerRead = (args: string[]) => Promise<{ stdout: string }>;
const Labels = z.record(z.string(), z.string()).nullable();
const Container = z.object({
  Id: z.string().min(1),
  Name: z.string(),
  Config: z.object({ Labels }),
  Mounts: z.array(z.object({ Type: z.string(), Name: z.string().optional() })),
});
const Network = z.object({ Id: z.string().min(1), Labels });

async function inspect(
  execute: DockerRead,
  kind: 'container' | 'network' | 'volume',
  name: string
) {
  try {
    const result = await execute([kind, 'inspect', name]);
    return z
      .array(z.record(z.string(), z.unknown()))
      .length(1)
      .parse(JSON.parse(result.stdout))[0];
  } catch (error) {
    const failure = z
      .object({ code: z.literal(1), stderr: z.string() })
      .safeParse(error);
    if (
      failure.success &&
      [
        `Error: No such ${kind}: ${name}`,
        `Error response from daemon: No such ${kind}: ${name}`,
        ...(kind === 'network'
          ? [`Error response from daemon: network ${name} not found`]
          : []),
        ...(kind === 'volume'
          ? [`Error response from daemon: get ${name}: no such volume`]
          : []),
      ].includes(failure.data.stderr.trim())
    )
      return null;
    throw new Error('cleanup_inspect_unknown');
  }
}

export function googleProviderResources(suffix: string) {
  z.uuid().parse(suffix);
  const network = `employee-gotrue-${suffix}`;
  return {
    suffix,
    network,
    auth: `${network}-auth`,
    database: `${network}-db`,
  };
}

export async function assertGoogleProviderResourcesAbsent(
  execute: DockerRead,
  suffix: string
) {
  const resources = googleProviderResources(suffix);
  for (const name of [resources.auth, resources.database])
    assert.equal(await inspect(execute, 'container', name), null);
  assert.equal(await inspect(execute, 'network', resources.network), null);
}

/** Delete only resources whose actual names/labels match this run's UUID.
 * Unknown inspect outcomes remain failures; no retry or unrelated cleanup. */
export async function cleanupGoogleProvider(
  execute: DockerRead,
  suffix: string
) {
  const { auth, database, network } = googleProviderResources(suffix);
  const volumes = new Set<string>();
  let absent = true;
  for (const name of [auth, database]) {
    try {
      const value = await inspect(execute, 'container', name);
      if (value === null) continue;
      const container = Container.parse(value);
      assert.equal(container.Name, `/${name}`);
      assert.equal(
        container.Config.Labels?.['employee-gotrue-qualification'],
        suffix
      );
      for (const mount of container.Mounts)
        if (mount.Type === 'volume') {
          assert.ok(mount.Name);
          volumes.add(mount.Name);
        }
      await execute(['rm', '-f', '-v', container.Id]);
      assert.equal(await inspect(execute, 'container', name), null);
    } catch {
      absent = false;
    }
  }
  try {
    const value = await inspect(execute, 'network', network);
    if (value !== null) {
      const actual = Network.parse(value);
      assert.equal(actual.Labels?.['employee-gotrue-qualification'], suffix);
      await execute(['network', 'rm', actual.Id]);
    }
    assert.equal(await inspect(execute, 'network', network), null);
  } catch {
    absent = false;
  }
  for (const volume of volumes) {
    try {
      assert.equal(await inspect(execute, 'volume', volume), null);
    } catch {
      absent = false;
    }
  }
  return {
    containers: [auth, database],
    network,
    volumes: [...volumes],
    absent,
  };
}
