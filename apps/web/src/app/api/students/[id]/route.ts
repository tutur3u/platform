import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json(
        { message: 'Error fetching student' },
        { status: 500 }
      );
    }

    if (!student) {
      return NextResponse.json(
        { message: 'Student not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ student });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: 'Error fetching student' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { name, studentNumber, program } = await request.json();
    const { id } = await params;

    const supabase = await createClient();

    const { error } = await supabase
      .from('students')
      .update({ name, student_number: studentNumber, program })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: 'Error updating student' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Student updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: 'Error updating student' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();

    const { error } = await supabase.from('students').delete().eq('id', id);

    if (error) {
      return NextResponse.json(
        { message: 'Error deleting student' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Student deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: 'Error deleting student' },
      { status: 500 }
    );
  }
}
