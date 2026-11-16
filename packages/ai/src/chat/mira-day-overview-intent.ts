import type { ModelMessage } from 'ai';
import { extractTextFromUserMessage } from './mira-render-ui-policy';

const AGENDA_ASK =
  /\b(agenda|plan (?:my|the) day|my day|today'?s? (?:schedule|plan|events|calendar|tasks)|(?:what'?s|what is) (?:on )?(?:my )?(?:schedule|calendar|plate) today)\b|lịch (?:trình )?hôm nay|kế hoạch hôm nay|hôm nay (?:tôi|mình|em) có (?:gì|lịch)/u;
const WRITE_ASK =
  /\b(create|add|move|delete|remove|reschedule|cancel|book|invite|block)\b|\b(tạo|thêm|xóa|xoá|dời|hủy|huỷ|đặt lịch)\b/u;

/**
 * Read-only "what does my day look like" asks. These go straight to
 * get_day_overview instead of discovering tools first, saving a model round
 * trip. Write requests keep the normal discovery flow.
 */
export function shouldUseDayOverviewForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const text = extractTextFromUserMessage(message).toLowerCase().trim();
    if (!text || text.length > 160) return false;
    return AGENDA_ASK.test(text) && !WRITE_ASK.test(text);
  }
  return false;
}
