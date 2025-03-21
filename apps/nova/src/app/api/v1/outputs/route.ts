import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get('submissionId');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase.from('nova_submission_outputs').select('*');
    if (submissionId) {
      query = query.eq('submission_id', Number(submissionId));
    }

    const { data: outputs, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching outputs' },
        { status: 500 }
      );
    }

    return NextResponse.json(outputs, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    submissionId: string;
    output: string;
  };

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate required fields
    if (!body.submissionId || !body.output) {
      return NextResponse.json(
        { message: 'Submission ID and output are required' },
        { status: 400 }
      );
    }

    const outputData: any = {
      output: body.output,
      submission_id: body.submissionId,
    };

    const { data: outputRecord, error: outputError } = await supabase
      .from('nova_submission_outputs')
      .insert(outputData)
      .select()
      .single();

    if (outputError) {
      console.error('Database Error: ', outputError);
      return NextResponse.json(
        { message: 'Error creating output record' },
        { status: 500 }
      );
    }

    return NextResponse.json(outputRecord, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
