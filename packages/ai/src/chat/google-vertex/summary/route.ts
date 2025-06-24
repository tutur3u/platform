import { vertex } from '@ai-sdk/google-vertex/edge';
import { createClient } from '@tuturuuu/supabase/next/server';
import { generateText, type Message } from 'ai';
import { NextResponse } from 'next/server';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';
export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const vertexModel = vertex(DEFAULT_MODEL_NAME, {
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ],
});

async function generateChatSummaryPrompt(prompt: string) {
  try {
    const res = await generateText({
      model: vertexModel,
      prompt,
      system: systemInstruction,
    });
    return res?.text || null;
  } catch (error) {
    console.log('Error generating chat summary:', error);
    throw error;
  }
}

export async function PATCH(req: Request) {
  const { id } = (await req.json()) as {
    id?: string;
  };

  try {
    if (!id) return new Response('Missing chat ID', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    const { data: rawMessages, error: messagesError } = await supabase
      .from('ai_chat_messages')
      .select('id, content, role')
      .eq('chat_id', id)
      .order('created_at', { ascending: true });

    if (messagesError)
      return new Response(messagesError.message, { status: 500 });

    if (!rawMessages)
      return new Response('Internal Server Error', { status: 500 });

    if (rawMessages.length === 0)
      return new Response('No messages found', { status: 404 });

    const messages = rawMessages.map((msg) => ({
      ...msg,
      role: msg.role.toLowerCase(),
    })) as Message[];

    if (!messages[messages.length - 1]?.id)
      return new Response('Internal Server Error', { status: 500 });

    if (messages[messages.length - 1]?.role === 'user')
      return new Response('Cannot summarize user message', { status: 400 });

    let prompt = '';
    for (const message of messages) {
      prompt += message.content;
    }

    if (!prompt) return new Response('Internal Server Error', { status: 500 });

    const completion = await generateChatSummaryPrompt(prompt);

    if (!completion) return new Response('No content found', { status: 404 });

    const { error } = await supabase
      .from('ai_chats')
      .update({
        latest_summarized_message_id: messages[messages.length - 1]?.id,
        summary: completion,
      })
      .eq('id', id);

    if (error) return new Response(error.message, { status: 500 });

    return new Response(JSON.stringify({ response: completion.trim() }), {
      status: 200,
    });
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

const systemInstruction = `
  Here is a set of guidelines I MUST follow:
  - DO NOT use any Markdown, LaTeX, or any code blocks in my responses.
  - DO NOT ask the user any questions, as my job is to summarize the chat messages.
  - ALWAYS generalize the summary and don't contain any questions or replies.
  - ALWAYS generate a short paragraph, around 3 sentences, to summarize the chat. If the chat is too short, try to summarize it as best as possible.
  - ALWAYS try to reduce repetition in the summary as much as possible.
  - ALWAYS make sure the summary is well-written, coherent, and is helpful to understand all topics discussed in the chat with a quick glance.
  `;
