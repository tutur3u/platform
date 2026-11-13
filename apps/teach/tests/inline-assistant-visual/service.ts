import { reviewEducationDocument as review } from '../../../../packages/internal-api/src/education';

export async function updateWorkspaceCourseModule() {
  return {};
}
export const reviewEducationDocument: typeof review = (
  input,
  signal,
  onProgress
) =>
  review(input, signal, onProgress, {
    baseUrl: location.origin,
    fetch: async () => {
      const from = input.text.indexOf('go to');
      const payload = JSON.stringify({
        suggestions:
          from < 0
            ? []
            : [
                {
                  id: 'subject-verb',
                  from,
                  to: from + 2,
                  original: 'go',
                  explanation:
                    input.locale === 'vi'
                      ? 'Chủ ngữ “She” là ngôi thứ ba số ít. Động từ ở thì hiện tại đơn cần thay đổi như thế nào?'
                      : '“She” is third-person singular. How should the verb change in the present simple?',
                  ...(input.level === 'full' ? { replacement: 'goes' } : {}),
                },
              ],
      });
      return new Response(
        new ReadableStream({
          async start(controller) {
            for (const chunk of [payload.slice(0, 40), payload.slice(40)]) {
              if (signal.aborted) {
                controller.error(new DOMException('Aborted', 'AbortError'));
                return;
              }
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          },
        })
      );
    },
  });
