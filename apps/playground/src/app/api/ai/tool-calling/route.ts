import {
  addBulkEvents,
  addEvent,
  checkBulkEventClashes,
  checkEventClashes,
  deleteBulkEvents,
  fetchCalendarEvents,
  findAvailableTimeSlot,
  fixZeroDurationEvents,
  moveEvent,
  rescheduleConflictingEvents,
  scheduleMultipleEvents,
  updateBulkEvents,
} from './tools';
import { toolCalling } from '@tuturuuu/ai/playground/tool-calling';
import { NextResponse } from 'next/server';

const extraTools = {
  fetchCalendarEvents,
  addEvent,
  moveEvent,
  checkEventClashes,
  findAvailableTimeSlot,
  addBulkEvents,
  updateBulkEvents,
  deleteBulkEvents,
  checkBulkEventClashes,
  scheduleMultipleEvents,
  rescheduleConflictingEvents,
  fixZeroDurationEvents,
};

export const GET = async () => {
  const { text, steps } = await toolCalling({ extraTools });
  return NextResponse.json({ text, steps });
};
