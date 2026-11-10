/** Feedback is plain report text; whitespace alone is not a reviewer comment. */
export function hasReportFeedback(feedback: unknown): feedback is string {
  return typeof feedback === 'string' && feedback.trim().length > 0;
}

export const REPORT_FEEDBACK_REQUIRED = {
  code: 'REPORT_FEEDBACK_REQUIRED',
  message: 'Report has no feedback. Báo cáo chưa có nhận xét.',
  messageEn: 'Report has no feedback.',
  messageVi: 'Báo cáo chưa có nhận xét',
} as const;
