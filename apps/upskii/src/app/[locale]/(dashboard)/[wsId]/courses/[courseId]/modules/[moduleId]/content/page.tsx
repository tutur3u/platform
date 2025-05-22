import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Goal, Sparkles } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import ModuleContentEditor from './content-editor';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleContentPage({
  params,
}: Props) {
  const { wsId, courseId, moduleId } = await params;
  const t = await getTranslations();


  const content = {
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {
        "textAlign": null,
        "level": 1
      },
      "content": [
        {
          "type": "text",
          "text": "Course 1"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "textAlign": null,
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Module 1"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "textAlign": null,
        "level": 3
      },
      "content": [
        {
          "type": "text",
          "text": "Section 1"
        }
      ]
    },
    {
      "type": "paragraph",
      "attrs": {
        "textAlign": null
      },
      "content": [
        {
          "type": "text",
          "text": "This is "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "strike"
            }
          ],
          "text": "some"
        },
        {
          "type": "text",
          "text": " "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "course"
        },
        {
          "type": "text",
          "text": " "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "content"
        }
      ]
    }
  ]
};

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <Goal className="h-5 w-5" />
              {t('course-details-tabs.module_content')}
            </h1>
          </div>
        }
        secondaryTrigger={
          <Button size="xs" variant="ghost" disabled>
            <Sparkles />
            {t('common.generate_with_ai')}
          </Button>
        }
        showSecondaryTrigger
      />
      {/* <ModuleContentEditor courseId={courseId} moduleId={moduleId} /> */}
      <ModuleContentEditor wsId={wsId} courseId={courseId} moduleId={moduleId} content={content} />
    </div>
  );
}
