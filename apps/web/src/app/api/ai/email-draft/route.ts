import { emailDraftSchema } from './schema';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const {
      context,
      recipients,
      purpose,
      tone,
      existingContent,
      userEmail,
      userDisplayName,
    } = await req.json();

    const prompt = `Generate a professional email draft based on the following context:

Sender Information:
- Name: ${userDisplayName || 'Not specified'}
- Email: ${userEmail || 'Not specified'}

Context: ${context || 'No specific context provided'}
Recipients: ${recipients || 'Not specified'}
Purpose: ${purpose || 'General communication'}
Tone: ${tone || 'professional'}
${existingContent ? `Existing content to build upon: ${existingContent}` : ''}

Please create an email that is:
- Professional and appropriate for the given context
- Clear and concise
- Well-structured with proper greeting and closing
- Tailored to the specified tone
- Suitable for the intended recipients
- Written from the perspective of ${userDisplayName || 'the sender'}

Format the email content with proper paragraph breaks. Use double line breaks between main paragraphs and single line breaks within paragraphs (like in signatures). The content should be ready to be inserted into an email editor.

Generate the email with a compelling subject line and well-crafted content.`;

    const result = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: emailDraftSchema,
      prompt,
    });

    return Response.json(result.object);
  } catch (error) {
    console.error('Error in email draft generation:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate email draft' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
