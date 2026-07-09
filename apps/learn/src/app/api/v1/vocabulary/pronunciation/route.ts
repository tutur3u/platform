import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function parseJsonObject(value: string) {
  const match = value.match(/\{[\s\S]*\}/u);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as {
      issues?: unknown;
      mistakes?: unknown;
      score?: unknown;
      summary?: unknown;
      transcript?: unknown;
      tips?: unknown;
    };
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeMistakes(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const target =
        typeof record.target === 'string' ? record.target.trim() : '';
      const heard = typeof record.heard === 'string' ? record.heard.trim() : '';
      const issue = typeof record.issue === 'string' ? record.issue.trim() : '';
      const suggestion =
        typeof record.suggestion === 'string' ? record.suggestion.trim() : '';
      const startIndex =
        typeof record.startIndex === 'number' &&
        Number.isInteger(record.startIndex)
          ? record.startIndex
          : null;
      const endIndex =
        typeof record.endIndex === 'number' && Number.isInteger(record.endIndex)
          ? record.endIndex
          : null;

      if (!target || !issue) return null;

      return { endIndex, heard, issue, startIndex, suggestion, target };
    })
    .filter(
      (
        item
      ): item is {
        endIndex: number | null;
        heard: string;
        issue: string;
        startIndex: number | null;
        suggestion: string;
        target: string;
      } => item !== null
    );
}

function textFromGeminiResponse(value: unknown) {
  const response = value as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('\n') ?? ''
  );
}

export async function POST(request: NextRequest) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        issues: ['Pronunciation analysis is not configured yet.'],
        mistakes: [],
        score: null,
        summary: 'Missing GOOGLE_GENERATIVE_AI_API_KEY.',
        tips: ['Ask an admin to configure the Google API key.'],
        transcript: '',
      },
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

  const record = body as Record<string, unknown>;
  const audioData =
    typeof record.audioData === 'string' ? record.audioData : '';
  const mimeType =
    typeof record.mimeType === 'string' ? record.mimeType : 'audio/webm';
  const targetText =
    typeof record.targetText === 'string' ? record.targetText.trim() : '';

  if (!audioData || !targetText || audioData.length > 7_500_000) {
    return NextResponse.json(
      { message: 'Audio and target text are required.' },
      { status: 400 }
    );
  }

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an American English pronunciation coach. The learner was asked to read this exact sentence: "${targetText}". Listen to the audio, transcribe what you heard, identify pronunciation mistakes, and give short actionable tips. Return only JSON with keys: transcript, score, summary, mistakes, issues, tips. Score is 0-100. mistakes must be an array of objects with keys: target, heard, issue, suggestion, startIndex, endIndex. target must be the exact word or phrase from the original sentence that was mispronounced, not a paraphrase. startIndex and endIndex must be zero-based character offsets in the original sentence where target appears; use null only if uncertain. heard should be what it sounded like, or an empty string if uncertain. If pronunciation is good, return an empty mistakes array.`,
              },
              {
                inline_data: {
                  data: audioData,
                  mime_type: mimeType,
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      method: 'POST',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to analyze pronunciation', {
      errorText,
      status: response.status,
    });

    return NextResponse.json(
      { message: 'Failed to analyze pronunciation.' },
      { status: 502 }
    );
  }

  const parsed = parseJsonObject(textFromGeminiResponse(await response.json()));

  if (!parsed) {
    return NextResponse.json(
      {
        issues: ['Could not read detailed pronunciation feedback.'],
        mistakes: [],
        score: null,
        summary: 'The analysis response was not structured.',
        tips: ['Try recording again in a quieter place.'],
        transcript: '',
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    issues: normalizeStringArray(parsed.issues).slice(0, 5),
    mistakes: normalizeMistakes(parsed.mistakes).slice(0, 6),
    score:
      typeof parsed.score === 'number' && Number.isFinite(parsed.score)
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : null,
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary
        : 'Pronunciation checked.',
    tips: normalizeStringArray(parsed.tips).slice(0, 5),
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
  });
}
