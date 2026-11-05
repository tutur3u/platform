import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/builder/course-builder-client',
  () => ({
    CourseBuilderClient: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/content-editor',
  () => ({
    ModuleContentEditor: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/client-ai',
  () => ({
    AIFlashcards: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/client-flashcards',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quiz-sets/columns',
  () => ({
    getQuizSetColumns: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quiz-sets/form',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/client-ai',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/client-quizzes',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/new/client',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock('@/app/[locale]/(dashboard)/[wsId]/education/courses/columns', () => ({
  getWorkspaceCourseColumns: vi.fn(() => null),
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/flashcards/columns',
  () => ({
    getWorkspaceFlashcardColumns: vi.fn(() => null),
  })
);
vi.mock('@/app/[locale]/(dashboard)/[wsId]/education/flashcards/form', () => ({
  default: vi.fn(() => null),
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/columns',
  () => ({
    getWorkspaceQuizColumns: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/form',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/columns',
  () => ({
    getWorkspaceCourseModuleColumns: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/linker',
  () => ({
    QuizsetModuleLinker: vi.fn(() => null),
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/columns',
  () => ({
    getQuizSetColumns: vi.fn(() => null),
  })
);
vi.mock('@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/form', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@/app/[locale]/(dashboard)/[wsId]/education/quizzes/columns', () => ({
  getWorkspaceQuizColumns: vi.fn(() => null),
}));
vi.mock('@/app/[locale]/(dashboard)/[wsId]/education/quizzes/form', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@/components/cards/StatisticCard', () => ({
  default: vi.fn(({ title }: { title: string }) =>
    createElement('div', { 'data-statistic': title }, title)
  ),
}));
vi.mock('@/components/custom-data-table', () => ({
  CustomDataTable: vi.fn(() => null),
}));
vi.mock('@/components/education-todo', () => ({
  TodoClient: vi.fn(() => null),
}));
vi.mock('@/components/loading-statistic-card', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@/utils/url-helper', () => ({
  extractYoutubeId: vi.fn(() => null),
}));
vi.mock('@tuturuuu/education-core/education/access', () => ({
  EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION: 'view_user_groups_reports',
}));
vi.mock('@tuturuuu/education-core/education/private-quiz-answers', () => ({
  attachPrivateWorkspaceQuizAnswers: vi.fn(() => null),
}));
vi.mock('@tuturuuu/icons', () => ({
  ArrowLeft: vi.fn(() => null),
  BookText: vi.fn(() => null),
  Box: vi.fn(() => null),
  CircleCheck: vi.fn(() => null),
  CircleX: vi.fn(() => null),
  ClipboardCheck: vi.fn(() => null),
  ClipboardList: vi.fn(() => null),
  Eye: vi.fn(() => null),
  Filter: vi.fn(() => null),
  Goal: vi.fn(() => null),
  GraduationCap: vi.fn(() => null),
  Layers: vi.fn(() => null),
  ListTodo: vi.fn(() => null),
  Paperclip: vi.fn(() => null),
  Plus: vi.fn(() => null),
  Sparkles: vi.fn(() => null),
  SquareCheck: vi.fn(() => null),
  SwatchBook: vi.fn(() => null),
  Youtube: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/accordion', () => ({
  Accordion: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/badge', () => ({
  Badge: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: vi.fn(() => null),
  CardContent: vi.fn(() => null),
  CardHeader: vi.fn(() => null),
  CardTitle: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/courses/course-card-view', () => ({
  CourseCardView: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/courses/course-form', () => ({
  CourseForm: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/courses/course-header', () => ({
  CourseHeader: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/courses/course-pagination', () => ({
  CoursePagination: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/modules/content-section', () => ({
  CourseSection: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/modules/link-button', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/modules/module-toggle', () => ({
  ModuleToggles: vi.fn(() => null),
}));
vi.mock(
  '@tuturuuu/ui/custom/education/modules/resources/delete-resource',
  () => ({
    DeleteResourceButton: vi.fn(() => null),
  })
);
vi.mock('@tuturuuu/ui/custom/education/modules/resources/file-display', () => ({
  FileDisplay: vi.fn(() => null),
}));
vi.mock(
  '@tuturuuu/ui/custom/education/modules/resources/file-upload-form',
  () => ({
    StorageObjectForm: vi.fn(() => null),
  })
);
vi.mock(
  '@tuturuuu/ui/custom/education/modules/youtube/delete-link-button',
  () => ({
    default: vi.fn(() => null),
  })
);
vi.mock('@tuturuuu/ui/custom/education/modules/youtube/embed', () => ({
  YoutubeEmbed: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/modules/youtube/form', () => ({
  default: vi.fn(() => null),
}));
vi.mock(
  '@tuturuuu/ui/custom/education/shell/education-content-surface',
  () => ({
    EducationContentSurface: vi.fn(
      ({ children }: { children: ReactNode }) => children
    ),
  })
);
vi.mock('@tuturuuu/ui/custom/education/shell/education-kpi-strip', () => ({
  EducationKpiStrip: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/education/shell/education-page-header', () => ({
  EducationPageHeader: vi.fn(({ title }: { title: string }) =>
    createElement('h1', null, title)
  ),
}));
vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/modifiable-dialog-trigger', () => ({
  default: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/custom/view-toggle', () => ({
  ViewToggle: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/label', () => ({
  Label: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/separator', () => ({
  Separator: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/table', () => ({
  Table: vi.fn(() => null),
  TableBody: vi.fn(() => null),
  TableCell: vi.fn(() => null),
  TableHead: vi.fn(() => null),
  TableHeader: vi.fn(() => null),
  TableRow: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/text-editor/editor', () => ({
  RichTextEditor: vi.fn(() => null),
}));
vi.mock('next/link', () => ({
  default: vi.fn(() => null),
}));
