import { readFile, stat } from "node:fs/promises";
import type { AccountUsage, UsageWindow } from "../types";
import { listJsonlFiles } from "./files";
import { claudeProjectsRoot } from "./paths";

interface TokenTotals {
	input: number;
	output: number;
	observedAt: string;
}

function readUsage(
	line: string,
	fallbackObservedAt: string,
): TokenTotals | undefined {
	try {
		const row: unknown = JSON.parse(line);
		if (!row || typeof row !== "object") return;
		const root = row as Record<string, unknown>;
		const message =
			root.message && typeof root.message === "object"
				? (root.message as Record<string, unknown>)
				: {};
		const usage =
			message.usage && typeof message.usage === "object"
				? (message.usage as Record<string, unknown>)
				: {};
		const input =
			typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
		const output =
			typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
		if (!input && !output) return;
		return {
			input,
			output,
			observedAt:
				typeof root.timestamp === "string"
					? root.timestamp
					: fallbackObservedAt,
		};
	} catch {
		return;
	}
}

function readPlanLimit(line: string): string | undefined {
	try {
		const row: unknown = JSON.parse(line);
		if (!row || typeof row !== "object") return;
		const root = row as Record<string, unknown>;
		if (root.type !== "assistant" && root.type !== "system") return;
		const message =
			root.message && typeof root.message === "object"
				? (root.message as Record<string, unknown>)
				: {};
		const content = message.content;
		const text =
			typeof content === "string" ? content : JSON.stringify(content ?? "");
		const searchable = text.toLowerCase();
		if (
			!searchable.includes("usage limit reached") &&
			!searchable.includes("you've hit your limit")
		)
			return;
		const resetIndex = searchable.indexOf("reset");
		const resetText =
			resetIndex >= 0 ? text.slice(resetIndex, resetIndex + 140) : "";
		return resetText.match(
			/20\d{2}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z/i,
		)?.[0];
	} catch {
		return;
	}
}

export async function collectClaude(
	instanceId: string,
	label: string,
	projectsRoot = claudeProjectsRoot(instanceId),
): Promise<AccountUsage> {
	if (!projectsRoot)
		return {
			instanceId,
			provider: "claude",
			label,
			windows: [],
			lastError: "No allowlisted instance directory",
		};
	const tokens = { input: 0, output: 0 };
	let lastMtime = 0;
	let latestUsageAt = 0;
	const now = Date.now();
	const cutoff = now - 24 * 60 * 60 * 1000;
	const windows: UsageWindow[] = [];
	let limitReset: string | undefined;
	let planLimitReached = false;
	for (const file of await listJsonlFiles(projectsRoot)) {
		try {
			const info = await stat(file);
			if (info.mtimeMs < Date.now() - 24 * 60 * 60 * 1000) continue;
			lastMtime = Math.max(lastMtime, info.mtimeMs);
			const content = await readFile(file, "utf8");
			for (const line of content.split("\n")) {
				const usage = readUsage(line, info.mtime.toISOString());
				if (usage) {
					const timestamp = Date.parse(usage.observedAt);
					if (
						!Number.isFinite(timestamp) ||
						timestamp < cutoff ||
						timestamp > now + 5 * 60_000
					)
						continue;
					tokens.input += usage.input;
					tokens.output += usage.output;
					latestUsageAt = Math.max(latestUsageAt, timestamp);
				}
				const reset = readPlanLimit(line);
				if (reset !== undefined) {
					planLimitReached = true;
					limitReset = reset;
				} else {
					try {
						const row = JSON.parse(line) as Record<string, unknown>;
						const message =
							row.message && typeof row.message === "object"
								? (row.message as Record<string, unknown>)
								: {};
						const content = message.content;
						const text = (
							typeof content === "string"
								? content
								: JSON.stringify(content ?? "")
						).toLowerCase();
						if (
							(row.type === "assistant" || row.type === "system") &&
							(text.includes("usage limit reached") ||
								text.includes("you've hit your limit"))
						)
							planLimitReached = true;
					} catch {
						/* Ignore malformed lines. */
					}
				}
			}
		} catch {
			/* Missing or unreadable transcripts remain unknown. */
		}
	}
	const observedAt = latestUsageAt
		? new Date(latestUsageAt).toISOString()
		: lastMtime
			? new Date(lastMtime).toISOString()
			: new Date().toISOString();
	if (tokens.input || tokens.output) {
		windows.push({
			kind: "session",
			estimated: tokens.input + tokens.output,
			source: "Claude Code local transcript usage (last 24h)",
			observedAt,
			authoritative: false,
		});
	}
	const resetTime = limitReset ? Date.parse(limitReset) : Number.NaN;
	const limitStillActive =
		planLimitReached &&
		(!limitReset || !Number.isFinite(resetTime) || resetTime > Date.now());
	if (limitStillActive)
		windows.push({
			kind: "weekly",
			usedPercent: 100,
			resetsAt: limitReset,
			source: "Claude Code local plan-limit event",
			observedAt,
			authoritative: true,
		});
	return {
		instanceId,
		provider: "claude",
		label,
		windows,
		recentTokens:
			tokens.input || tokens.output ? { ...tokens, observedAt } : undefined,
	};
}
