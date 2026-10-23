import type { AccountUsage, ActiveAssignment } from "../types";
import { DEFAULT_INSTANCE_LABELS } from "../types";
import { collectClaude } from "./claude";
import { collectCodex } from "./codex";
import { collectT3State } from "./t3";

export async function collectAll(): Promise<{
	accounts: AccountUsage[];
	active: ActiveAssignment[];
	t3ObservedAt?: string;
}> {
	const t3 = collectT3State();
	const accounts = await Promise.all(
		Object.entries(DEFAULT_INSTANCE_LABELS).map(([instanceId, label]) =>
			instanceId.startsWith("claude")
				? collectClaude(instanceId, label)
				: collectCodex(instanceId, label),
		),
	);
	return {
		accounts,
		active: t3.activeAssignments,
		t3ObservedAt: t3.observedAt,
	};
}
