import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { gateway, generateObject } from 'ai';
import { emailDraftSchema } from './schema';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // Get the current user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('User is unauthenticated');
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!user.email) {
      console.error('User has no email address');
      return Response.json(
        { message: 'User email not found' },
        { status: 400 }
      );
    }

    // Check if user has authorized email domain
    if (!isValidTuturuuuEmail(user.email)) {
      console.error('User is not using a valid Tuturuuu email');
      return Response.json(
        {
          message: 'Only Tuturuuu emails are allowed',
        },
        { status: 401 }
      );
    }

    const {
      context,
      recipients,
      purpose,
      tone,
      existingContent,
      revisionInstructions,
      userEmail,
      userDisplayName,
    } = await req.json();

    const isRevision = revisionInstructions && existingContent;

    const prompt = isRevision
      ? `Revise the following email based on the user's instructions:

Sender Information:
- Name: ${userDisplayName || 'Not specified'}
- Email: ${userEmail || 'Not specified'}

Original Email Content:
${existingContent}

Revision Instructions: ${revisionInstructions}

Please revise the email according to the instructions while maintaining:
- Professional and appropriate tone
- Clear and concise communication
- Proper structure with greeting and closing
- The specified tone: ${tone || 'professional'}
- Suitability for the intended recipients: ${recipients || 'Not specified'}
- Writing from the perspective of ${userDisplayName || 'the sender'}

Format the email content with proper paragraph breaks. Use double line breaks between main paragraphs and single line breaks within paragraphs (like in signatures). The content should be ready to be inserted into an email editor.

Generate the revised email with an appropriate subject line and well-crafted content.`
      : `Generate a professional email draft based on the following context:

Sender Information:
- Name: ${userDisplayName || 'Not specified'}
- Email: ${userEmail || 'Not specified'}

Context: ${context || 'No specific context provided'}
Recipients: ${recipients || 'Not specified'}
Purpose: ${purpose || 'General communication'}
Tone: ${tone || 'professional'}

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
      model: gateway('google/gemini-2.5-flash-lite'),
      schema: emailDraftSchema,
      prompt,
    });

    return Response.json(result.object);
  } catch (error) {
    console.error('Error in email draft generation:', error);

    // Handle specific auth errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    return new Response(
      JSON.stringify({ error: 'Failed to generate email draft' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
