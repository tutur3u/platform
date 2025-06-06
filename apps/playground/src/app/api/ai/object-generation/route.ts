import { generateTask } from '@tuturuuu/ai/playground/object-generation';
import { NextResponse } from 'next/server';

export const GET = async () => {
  const { object } = await generateTask();
  return NextResponse.json(object);
};
