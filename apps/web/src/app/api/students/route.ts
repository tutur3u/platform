import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const supabase = await createClient();

    let query = supabase.from('students').select('*');

    if (startDate || endDate) {
      // Validate dates
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
          return NextResponse.json(
            { message: 'Start date cannot be later than end date' },
            { status: 400 }
          );
        }
      }

      // Apply date filters using Supabase's built-in date range functions
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
    }

    const { data: students, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: 'Error fetching students' },
        { status: 500 }
      );
    }

    return NextResponse.json({ students });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: 'Error fetching students' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name, studentNumber, program, timestamp } = await request.json();

    const supabase = await createClient();

    const { error } = await supabase.from('students').insert({
      name,
      student_number: studentNumber,
      program,
      created_at: timestamp,
    });

    if (error) {
      return NextResponse.json(
        { message: 'Error creating student' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Students added successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: 'Error creating student' },
      { status: 500 }
    );
  }
}
