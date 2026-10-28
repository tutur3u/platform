import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const user = await getSatelliteAppSessionUser('infra');

  // if user is not logged in
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // if user is not part of Tuturuuu org
  if (
    !isVerifiedTuturuuuStaffSession(
      user &&
        (await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        ))
    )
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const data = (await request?.json()) as {
    audio?: string;
    diarize_audio?: boolean;
  };

  if (!data.audio) {
    return new Response('audio is required', { status: 400 });
  }

  // const mockData = {
  //   audio: '', // base64 encoded audio
  //   diarize_audio: true,
  // };

  const response = await fetch(
    'https://https://modal-labs--instant-whisper.modal.run',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.MODAL_TOKEN_ID}:${process.env.MODAL_TOKEN_SECRET}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (response.status !== 201) {
    const message = await response.text();
    return Response.json({ message }, { status: 500 });
  }

  const imageBuffer = await response.arrayBuffer();
  return new Response(Buffer.from(imageBuffer), {
    headers: { 'Content-Type': 'image/png' },
  });
}
