import { createAdminClient } from '@/utils/supabase/client';
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { GoogleGenerativeAIStream, Message, StreamingTextResponse } from 'ai';
import { cookies } from 'next/headers';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL_NAME = 'gemini-1.0-pro-latest';
const API_KEY = process.env.GOOGLE_API_KEY || '';

const genAI = new GoogleGenerativeAI(API_KEY);

const generationConfig = {
  temperature: 0.9,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export async function POST(req: Request) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin) return new Response('Internal Server Error', { status: 500 });

  const {
    id,
    wsId,
    model,
    messages,
    previewToken,
    stream = true,
  } = (await req.json()) as {
    id?: string;
    wsId?: string;
    model?: string;
    messages?: Message[];
    previewToken?: string;
    stream?: boolean;
  };

  try {
    // if (!id) return new Response('Missing chat ID', { status: 400 });
    if (!wsId) return new Response('Missing workspace ID', { status: 400 });
    if (!messages) return new Response('Missing messages', { status: 400 });

    const apiKey = previewToken || process.env.GOOGLE_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    const { count, error } = await sbAdmin
      .from('workspace_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('name', 'ENABLE_CHAT')
      .eq('value', 'true');

    if (error) return new Response(error.message, { status: 500 });
    if (count === 0)
      return new Response('You are not allowed to use this feature.', {
        status: 401,
      });

    const prompt = buildGooglePrompt(messages);

    if (!prompt) return new Response('Internal Server Error', { status: 500 });

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

    if (stream) {
      const geminiStream = await genAI
        .getGenerativeModel({
          model: model || DEFAULT_MODEL_NAME,
          generationConfig,
          safetySettings,
        })
        .generateContentStream(prompt);

      const res = GoogleGenerativeAIStream(geminiStream, {
        onStart: async () => {
          // If there is only 1 message, we will not save it to the database
          // Since it is the prompt message that created the conversation
          if (messages.length === 1) return;

          const userMessages = messages.filter(
            (msg: Message) => msg.role === 'user'
          );

          const message = userMessages[userMessages.length - 1]?.content;
          if (!message) {
            console.log('No message found');
            throw new Error('No message found');
          }

          const { error } = await sbAdmin.rpc('insert_ai_chat_message', {
            message,
            chat_id: chatId,
          });

          if (error) {
            console.log(error);
            throw new Error(error.message);
          }

          console.log('User message saved to database');
        },
        onCompletion: async (completion) => {
          if (!completion) {
            console.log('No content found');
            throw new Error('No content found');
          }

          const { error } = await sbAdmin.from('ai_chat_messages').insert({
            chat_id: chatId,
            content: completion,
            role: 'ASSISTANT',
            model: 'GOOGLE-GEMINI-PRO',
          });

          if (error) {
            console.log(error);
            throw new Error(error.message);
          }

          console.log('AI Response saved to database');
        },
      });
      return new StreamingTextResponse(res);
    } else {
      const geminiRes = await genAI
        .getGenerativeModel({
          model: model || DEFAULT_MODEL_NAME,
          generationConfig,
          safetySettings,
        })
        .generateContent(prompt);

      const completion =
        geminiRes.response.candidates?.[0].content.parts[0].text;
      if (!completion) return new Response('No content found', { status: 404 });

      const { error } = await sbAdmin.from('ai_chat_messages').insert({
        chat_id: chatId,
        content: completion,
        role: 'ASSISTANT',
        model: 'GOOGLE-GEMINI-PRO',
      });

      if (error) return new Response(error.message, { status: 500 });

      return new Response(JSON.stringify({ response: completion }), {
        status: 200,
      });
    }
  } catch (error: any) {
    console.log(error);
    return new Response(
      `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      {
        status: 200,
      }
    );
  }
}

const normalizeGoogle = (message: Message) => ({
  role:
    message.role === 'user'
      ? 'user'
      : ('model' as 'user' | 'function' | 'model'),
  parts: [{ text: message.content }],
});

const normalizeGoogleMessages = (messages: Message[]) =>
  messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    )
    .map(normalizeGoogle);

// const leadingMessages: Message[] = [
//   {
//     id: 'identity-reminder',
//     role: 'system',
//     content: `
//     You are Skora, an AI by Tuturuuu, customized and engineered by Võ Hoàng Phúc - The Founder of Tuturuuu.

//     Here is a set of guidelines you MUST follow:

//     - Utilize Markdown formatting (WITHOUT HTML, as it is NOT SUPPORTED) and turn your response into an essay, or even better, a blog post where possible to enrich the chatting experience with the user in a smart, easy-to-understand, and organized way.
//     - If there are any math operations or formulas, you MUST use LaTeX, in combination with Markdown, to render them properly.
//     - At THE END and ONLY at THE END of your answer, you MUST provide 3 helpful follow-up prompts that predict WHAT THE USER MIGHT ASK, note that the question MUST be asked from the user perspective (each enclosed in "@<FOLLOWUP>" and "</FOLLOWUP>" pairs and NO USAGE of Markdown or LaTeX in this section, e.g. \n\n@<FOLLOWUP>Can you elaborate on the first topic?</FOLLOWUP>\n\n@<FOLLOWUP>Can you provide an alternative solution?</FOLLOWUP>\n\n@<FOLLOWUP>How would the approach that you suggested be more suitable for my use case?</FOLLOWUP>) so that user can choose to ask you and continue the conversation with you in a meaningful and helpful way. Outside of this section, ALWAYS use Markdown and LaTeX to enrich the chatting experience with the user.
//     `.trim(),
//   },
// ];

// const trailingMessages: Message[] = [];

function buildGooglePrompt(messages: Message[]) {
  const normalizedMsgs = normalizeGoogleMessages([
    // ...leadingMessages,
    ...messages,
    // ...trailingMessages,
  ]);

  return { contents: normalizedMsgs };
}
