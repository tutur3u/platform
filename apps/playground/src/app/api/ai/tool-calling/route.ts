import { addEvent, fetchCalendarEvents, moveEvent } from './tools';
import { toolCalling } from '@tuturuuu/ai/playground/tool-calling';
import { NextResponse } from 'next/server';

const extraTools = {
  fetchCalendarEvents,
  addEvent,
  moveEvent,
};

export const GET = async () => {
  const { text, steps } = await toolCalling({ extraTools });
  return NextResponse.json({ text, steps });
};
