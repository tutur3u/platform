import { NextResponse } from 'next/server';

interface CalendarEvent {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
}

export async function GET() {
  const data: CalendarEvent[] = [
    {
      id: 1,
      title: 'Event 1',
      start_at: '2023-10-01T10:00:00Z',
      end_at: '2023-10-01T11:00:00Z',
    },
    {
      id: 2,
      title: 'Event 2',
      start_at: '2023-10-02T12:00:00Z',
      end_at: '2023-10-02T13:00:00Z',
    },
    {
      id: 3,
      title: 'Event 3',
      start_at: '2023-10-03T14:00:00Z',
      end_at: '2023-10-03T15:00:00Z',
    },
  ];

  return NextResponse.json({ data });
}
