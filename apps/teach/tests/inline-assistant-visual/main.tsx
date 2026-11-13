import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { createRoot } from 'react-dom/client';
import { ModuleContentEditor } from '../../src/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/content-editor';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import './style.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
document.documentElement.lang = locale;
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
const content = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        {
          type: 'text',
          text:
            locale === 'vi'
              ? 'Khi giáo viên trở thành học sinh'
              : 'When teachers become students',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            locale === 'vi'
              ? 'Cùng khám phá lớp học AI tự chủ. Hãy kiểm tra lập luận và giữ giọng văn riêng của mình.'
              : 'Explore an agentic classroom. Check your reasoning and keep your own voice.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'She go to the science laboratory every morning.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            locale === 'vi'
              ? 'Ghi lại từng bước: giả thuyết, bằng chứng và kết luận. Nguồn trích dẫn cần được kiểm chứng.'
              : 'Record each step: hypothesis, evidence, and conclusion. Verify your citations before submission.',
        },
      ],
    },
  ],
};

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'vi' ? vi : en}
    >
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-border border-b pb-4">
          <span className="font-semibold">Tuturuuu · Teach</span>
          <span className="text-muted-foreground text-xs">
            {locale === 'vi'
              ? 'EduFest 2026 · Bản xem thử cục bộ'
              : 'EduFest 2026 · Local review fixture'}
          </span>
        </header>
        <h1 className="font-semibold text-2xl">
          {locale === 'vi' ? 'Nội dung học phần' : 'Module content'}
        </h1>
        <ModuleContentEditor
          wsId="00000000-0000-4000-8000-000000000001"
          courseId="11111111-1111-4111-8111-111111111111"
          moduleId="22222222-2222-4222-8222-222222222222"
          content={content}
        />
      </main>
    </NextIntlClientProvider>
  </QueryClientProvider>
);
