import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { collectClaude } from "../src/collectors/claude";
import { collectCodex } from "../src/collectors/codex";
import { collectT3State } from "../src/collectors/t3";

const temporary: string[] = [];
async function tempDir(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "agent-quota-"));
	temporary.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(
		temporary
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("local collectors", () => {
	it("collects Codex authoritative windows and recent token counts", async () => {
		const root = await tempDir();
		const sessions = join(root, "sessions");
		await mkdir(sessions);
		const observedAt = new Date().toISOString();
		await writeFile(
			join(sessions, "fixture.jsonl"),
			`${JSON.stringify({
				timestamp: observedAt,
				type: "event_msg",
				payload: {
					type: "token_count",
					info: { last_token_usage: { input_tokens: 17, output_tokens: 9 } },
					rate_limits: {
						primary: {
							used_percent: 28,
							window_minutes: 300,
							resets_at: observedAt,
						},
						secondary: {
							used_percent: 45,
							window_minutes: 10080,
							resets_at: observedAt,
						},
					},
				},
			})}\n`,
		);
		const result = await collectCodex("codex", "test-account", [root]);
		expect(
			result.windows.find((window) => window.kind === "short")?.usedPercent,
		).toBe(28);
		expect(
			result.windows.find((window) => window.kind === "long")?.usedPercent,
		).toBe(45);
		expect(
			result.windows.find((window) => window.kind === "session")?.estimated,
		).toBe(26);
		expect(
			result.windows.filter((window) => window.authoritative),
		).toHaveLength(2);
	});

	it("estimates Claude token totals without fabricating a quota percentage", async () => {
		const root = await tempDir();
		const project = join(root, "project");
		await mkdir(project);
		await writeFile(
			join(project, "fixture.jsonl"),
			`${JSON.stringify({
				type: "assistant",
				timestamp: new Date().toISOString(),
				message: { usage: { input_tokens: 12, output_tokens: 8 } },
			})}\n`,
		);
		const result = await collectClaude("claudeAgent", "test-account", root);
		expect(result.recentTokens).toMatchObject({ input: 12, output: 8 });
		expect(result.windows[0]).toMatchObject({
			kind: "session",
			estimated: 20,
			authoritative: false,
		});
		expect(result.windows[0]?.usedPercent).toBeUndefined();
	});

	it("treats a Claude plan-limit event as exhausted quota and records a visible reset time", async () => {
		const root = await tempDir();
		const observedAt = new Date().toISOString();
		await writeFile(
			join(root, "fixture.jsonl"),
			`${JSON.stringify({
				type: "assistant",
				timestamp: observedAt,
				message: {
					content: [
						{
							type: "text",
							text: "Usage limit reached. Reset at 2026-10-23T02:00:00Z.",
						},
					],
				},
			})}\n`,
		);
		const result = await collectClaude("claudeAgent", "test-account", root);
		expect(result.windows[0]).toMatchObject({
			kind: "weekly",
			usedPercent: 100,
			resetsAt: "2026-10-23T02:00:00Z",
			authoritative: true,
		});
	});

	it("reads only safe T3 assignment metadata in read-only mode", async () => {
		const root = await tempDir();
		const path = join(root, "state.sqlite");
		const db = new DatabaseSync(path);
		db.exec(`CREATE TABLE orchestration_v2_projection_provider_sessions (provider_instance_id TEXT, provider TEXT, updated_at TEXT);
      CREATE TABLE orchestration_v2_projection_subagents (provider_instance_id TEXT, provider TEXT, status TEXT, started_at TEXT);
      INSERT INTO orchestration_v2_projection_provider_sessions VALUES ('codex', 'codex', '2026-10-23T01:00:00Z');
      INSERT INTO orchestration_v2_projection_subagents VALUES ('codex', 'codex', 'running', '2026-10-23T01:00:00Z');`);
		db.close();
		const result = collectT3State(path);
		expect(result.quotaSnapshotsFound).toBe(false);
		expect(result.providerByInstance).toEqual({ codex: "codex" });
		expect(result.activeAssignments).toEqual([
			{ instanceId: "codex", count: 1 },
		]);
		expect(() =>
			new DatabaseSync(path, { readOnly: true }).exec(
				"CREATE TABLE should_not_exist (id INTEGER)",
			),
		).toThrow();
	});
});
