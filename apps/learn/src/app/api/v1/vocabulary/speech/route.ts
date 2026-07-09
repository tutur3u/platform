import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const GOOGLE_TTS_MODEL =
  process.env.GOOGLE_TTS_MODEL ?? 'gemini-3.1-flash-tts-preview';
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE ?? 'Puck';
const SAMPLE_RATE = 24000;

function pcmToWav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function audioFromGeminiResponse(value: unknown) {
  if (!value || typeof value !== 'object') return null;

  const response = value as Record<string, unknown>;
  const directAudio =
    audioDataFromRecord(response, 'output_audio') ??
    audioDataFromRecord(response, 'outputAudio');

  if (directAudio) return Buffer.from(directAudio, 'base64');

  const nestedAudio = findBase64AudioData(response);

  return nestedAudio ? Buffer.from(nestedAudio, 'base64') : null;
}

function audioDataFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const audio = value as Record<string, unknown>;
  return typeof audio.data === 'string' ? audio.data : null;
}

function findBase64AudioData(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBase64AudioData(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const directAudio =
    audioDataFromRecord(record, 'audio') ??
    audioDataFromRecord(record, 'audioData') ??
    audioDataFromRecord(record, 'output_audio') ??
    audioDataFromRecord(record, 'outputAudio');

  if (directAudio) return directAudio;

  const inlineData = record.inlineData ?? record.inline_data;

  if (
    inlineData &&
    typeof inlineData === 'object' &&
    !Array.isArray(inlineData)
  ) {
    const data = (inlineData as Record<string, unknown>).data;
    if (typeof data === 'string') return data;
  }

  const data = record.data;
  const mimeType = record.mimeType ?? record.mime_type ?? record.type;
  if (
    typeof data === 'string' &&
    typeof mimeType === 'string' &&
    mimeType.toLowerCase().includes('audio')
  ) {
    return data;
  }

  for (const child of Object.values(record)) {
    const found = findBase64AudioData(child);
    if (found) return found;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: 'Missing GOOGLE_GENERATIVE_AI_API_KEY.' },
      { status: 501 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const text =
    typeof (body as { text?: unknown }).text === 'string'
      ? (body as { text: string }).text.trim()
      : '';
  const kind =
    (body as { kind?: unknown }).kind === 'example' ? 'example' : 'word';

  if (!text || text.length > 500) {
    return NextResponse.json(
      { message: 'Text is required and must be 500 characters or fewer.' },
      { status: 400 }
    );
  }

  const prompt =
    kind === 'word'
      ? `Read this vocabulary word in clear American English. Speak only the word: ${text}`
      : `Read this example sentence in clear American English. Speak only the sentence: ${text}`;

  const googleResponse = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        generation_config: {
          speech_config: [{ voice: GOOGLE_TTS_VOICE }],
        },
        input: prompt,
        model: GOOGLE_TTS_MODEL,
        response_format: { type: 'audio' },
      }),
    }
  );

  if (!googleResponse.ok) {
    const errorText = await googleResponse.text();
    console.error('Failed to generate vocabulary speech', {
      errorText,
      status: googleResponse.status,
    });

    return NextResponse.json(
      { message: 'Failed to generate speech.' },
      { status: 502 }
    );
  }

  const googlePayload = await googleResponse.json();
  const pcm = audioFromGeminiResponse(googlePayload);

  if (!pcm) {
    console.error('Speech response did not include audio', {
      keys:
        googlePayload && typeof googlePayload === 'object'
          ? Object.keys(googlePayload as Record<string, unknown>)
          : [],
    });
    return NextResponse.json(
      { message: 'Speech response did not include audio.' },
      { status: 502 }
    );
  }

  const wav = pcmToWav(pcm);

  return new NextResponse(wav, {
    headers: {
      'Cache-Control': 'private, max-age=86400',
      'Content-Type': 'audio/wav',
    },
  });
}
