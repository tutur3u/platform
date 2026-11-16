import { getToolName, isToolUIPart } from 'ai';
import type { MessageRenderDescriptor } from '../resolve-message-render-groups';
import { type DayOverview, parseDayOverview } from './parse-day-overview';

/** A finished get_day_overview call renders as agenda cards, not a tool row. */
export function dayOverviewFromDescriptor(
  descriptor: MessageRenderDescriptor
): DayOverview | null {
  if (descriptor.kind !== 'tool') return null;
  const { part } = descriptor;
  if (!isToolUIPart(part) || getToolName(part) !== 'get_day_overview')
    return null;
  if (part.state !== 'output-available') return null;
  return parseDayOverview(part.output);
}
