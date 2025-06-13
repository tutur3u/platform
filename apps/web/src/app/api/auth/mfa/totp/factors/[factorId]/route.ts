import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface Params {
  params: Promise<{
    factorId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { factorId } = await params;

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // List all factors to find the specific one
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Find the specific factor by ID
    const allFactors = [...data.totp];
    const factor = allFactors.find((f) => f.id === factorId);

    if (!factor) {
      return NextResponse.json({ error: 'Factor not found' }, { status: 404 });
    }

    return NextResponse.json(factor);
  } catch (error) {
    console.error('Error getting factor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { factorId } = await params;

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Unenroll the factor
    const { data, error } = await supabase.auth.mfa.unenroll({
      factorId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Factor unenrolled successfully',
      data,
    });
  } catch (error) {
    console.error('Error unenrolling factor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
