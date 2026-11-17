import { describe, expect, it } from "vitest";
import { fleetSnapshot } from "./fleet";
import { proposedHostRegistry } from "./resources-hosts-config";

describe("fleet inventory", () => {
  it("excludes M3 before transport and redacts failures", async () => {
    const registry = proposedHostRegistry();
    registry.hosts = registry.hosts.filter((host) => host.kind === "runner");
    const runner = registry.hosts[0]!;
    registry.hosts.push({ ...runner, id: "m3", sshHost: "m3.local" });
    const called: string[] = [];
    const result = await fleetSnapshot(registry, {
      now: () => 1000,
      local: async () => {
        throw new Error("private path");
      },
      probe: async (input) => {
        called.push(...input.hosts.map((host) => host.id));
        throw new Error("/private/path SECRET");
      },
    });
    expect(called).toEqual([runner.id]);
    expect(result.hosts).toEqual([
      { id: runner.id, telemetry: "UNKNOWN", executionEligibility: "UNKNOWN" },
    ]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("does not claim zero when local telemetry is malformed", async () => {
    const registry = proposedHostRegistry();
    registry.hosts = registry.hosts.filter((host) => host.kind === "local");
    const result = await fleetSnapshot(registry, {
      now: () => 1000,
      local: async () => ({}),
      probe: async () => ({}),
    });
    expect(result.hosts[0]?.telemetry).toBe("UNKNOWN");
    expect(result.threads).toBe("UNKNOWN");
  });
  it("keeps successful local telemetry when another host fails", async () => {
    const result = await fleetSnapshot(proposedHostRegistry(), {
      now: () => 1000,
      local: async () => ({
        occupied: 2,
        waiting: [{}],
        machine: { platform: "darwin" },
        disk: { freeGiB: 80 },
      }),
      probe: async () => {
        throw new Error("unreachable");
      },
    });
    expect(result.hosts[0]).toMatchObject({
      telemetry: "CURRENT",
      brokerJobs: { running: 2, waiting: 1, diskFreeGiB: 80 },
    });
    expect(result.hosts[1]).toMatchObject({ telemetry: "UNKNOWN" });
  });
  it("expires early successes when the complete collection exceeds TTL", async () => {
    const registry = proposedHostRegistry();
    registry.telemetryTtlSeconds = 10;
    let time = 1000;
    const result = await fleetSnapshot(registry, {
      now: () => time,
      local: async () => ({
        occupied: 2,
        waiting: [],
        machine: { platform: "darwin" },
        disk: { freeGiB: 80 },
      }),
      probe: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        time = 13000;
        throw new Error("timeout");
      },
    });
    expect(result.hosts.every((host) => host.telemetry === "UNKNOWN")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("brokerJobs");
    expect(result.collectedAt).toBe(new Date(13000).toISOString());
  });
});
