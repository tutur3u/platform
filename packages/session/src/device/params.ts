/**
 * Step-up parameters: the reducer takes an act's raw parameters, never a
 * hash. It validates them against the act table and the route's tenant
 * fields, sorts the fields the table marks sorted, and hashes them with the
 * shared parameters digest, so a host cannot spend a grant on other
 * parameters by echoing its hash.
 */
import type { JsonValue } from '../encoding';
import { digestActParams } from '../stepup/params-digest';
import {
  actSpec,
  type GrantAct,
  type ParamType,
  type StepUpRoute,
} from './registry';

export type NormalizedParams = Readonly<
  Record<string, string | number | string[]>
>;

function checkField(
  value: JsonValue | undefined,
  type: ParamType
): JsonValue | null {
  if (type === 'string') {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
  if (type === 'integer') {
    return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? value
      : null;
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    return null;
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length) return null;
  // The default sort compares UTF-16 code units, the canonical key order.
  return type === 'sorted_strings' ? [...strings].sort() : [...strings];
}

/**
 * The act's parameters with every required and tenant field present and no
 * other member, or null. Tenant fields the act table does not type are
 * non-empty strings.
 */
export function normalizeParams(
  act: GrantAct,
  tenantParams: readonly string[],
  params: JsonValue
): NormalizedParams | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return null;
  }
  const spec = actSpec(act).params as Record<string, ParamType>;
  const fields = new Set([...Object.keys(spec), ...tenantParams]);
  const record = params as Record<string, JsonValue>;
  const keys = Object.keys(record);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) {
    return null;
  }
  const normalized: Record<string, string | number | string[]> = {};
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) return null;
    const checked = checkField(record[field], spec[field] ?? 'string');
    if (checked === null) return null;
    normalized[field] = checked as string | number | string[];
  }
  return Object.freeze(normalized);
}

/** The grant `ph` for a route's act and raw parameters, or null when they are invalid. */
export async function grantParamsHash(
  stepUp: StepUpRoute['stepUp'],
  params: JsonValue
): Promise<{ ph: string; params: NormalizedParams } | null> {
  const normalized = normalizeParams(stepUp.act, stepUp.tenantParams, params);
  if (!normalized) return null;
  const digest = await digestActParams(stepUp.act, normalized);
  return digest ? { ph: digest.ph, params: normalized } : null;
}
