import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message)
      return NextResponse.json('No message provided', { status: 400 });

    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json('Unauthorized', { status: 401 });

    const { data: id, error } = await supabase.rpc('create_ai_chat', {
      message,
    });

    if (error) return NextResponse.json(error.message, { status: 500 });
    return NextResponse.json({ id }, { status: 200 });
  } catch (error: any) {
    console.log(error);
    return NextResponse.json(
      `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      {
        status: 200,
      }
    );
  }
}
