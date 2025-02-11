import { ScrollArea } from '@tutur3u/ui/scroll-area';
import { Separator } from '@tutur3u/ui/separator';

interface LessonSection {
  title: string;
  content: string;
}

interface LessonProps {
  lesson: {
    title: string;
    sections: LessonSection[];
  };
}

export function LessonContent({ lesson }: LessonProps) {
  return (
    <ScrollArea className="h-[calc(100vh-12rem)]">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        {lesson.sections.map((section, index) => (
          <div key={index} className="space-y-2">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="whitespace-pre-line text-muted-foreground">
              {section.content}
            </p>
            {index < lesson.sections.length - 1 && (
              <Separator className="my-4" />
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
