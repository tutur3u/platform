import { createAdminClient, createClient } from '@/utils/supabase/server';
import { vertex } from '@ai-sdk/google-vertex/edge';
import { experimental_generateImage as generateImage } from 'ai';
import { NextResponse } from 'next/server';

const IMAGE_MODEL = 'imagen-3.0-fast-generate-001';
export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const vertexModel = vertex.image(IMAGE_MODEL);

export async function POST(req: Request) {
  const sbAdmin = await createAdminClient();

  const { id, prompt } = (await req.json()) as {
    id?: string;
    model?: string;
    prompt?: string;
  };

  try {
    if (!prompt) return new Response('Missing messages', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    let chatId = id;

    if (!chatId) {
      const { data, error } = await sbAdmin
        .from('ai_chats')
        .select('id')
        .eq('creator_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) return new Response(error.message, { status: 500 });
      if (!data) return new Response('Internal Server Error', { status: 500 });

      chatId = data.id;
    }

    // Stream text with user input
    const { image } = await generateImage({
      n: 1,
      model: vertexModel,
      prompt,
      providerOptions: {
        vertex: { aspectRatio: '16:9' },
      },
    });

    return NextResponse.json({ image });
  } catch (error: any) {
    console.log(error);
    return NextResponse.json(
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      },
      {
        status: 500,
      }
    );
  }
}
