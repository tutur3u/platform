'use client';

import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { ChevronRight } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';

// WARNING: Placeholder data - Remove when possible
const MOCK_MEETINGS = [
  { id: '1', name: 'Meeting 2025_08_24-16_36_04' },
  { id: '2', name: 'Project Kickoff' },
  { id: '3', name: 'Weekly Standup' },
  { id: '4', name: 'Client Feedback' },
  { id: '5', name: 'Financial Review' },
  { id: '6', name: 'Marketing Strategy Brainstorm' },
];

export function MeetingHistory({
  title,
  viewMoreText,
}: {
  title: string;
  viewMoreText: string;
}) {
  return (
    <Card className="border-muted-foreground/25 bg-card text-foreground">
      <CardHeader className="px-6 pb-2 pt-3">
        <CardTitle className="text-center text-lg font-bold">{title}</CardTitle>
      </CardHeader>

      <CardContent className="px-0 pb-2 pt-0">
        <div>
          {MOCK_MEETINGS.map((meeting, index) => (
            <div key={meeting.id}>
              <button className="text-foreground hover:bg-muted/50 flex w-full items-center justify-between px-3 py-4 text-left text-sm transition-colors">
                <span>{meeting.name}</span>
                <ChevronRight className="text-muted-foreground size-4" />
              </button>

              {index < MOCK_MEETINGS.length - 1 && (
                <Separator className="bg-muted-foreground/25" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 px-2">
          <Button variant="secondary" className="h-10 w-full">
            {viewMoreText}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
