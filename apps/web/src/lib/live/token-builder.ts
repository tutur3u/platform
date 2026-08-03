import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { GEMINI_LIVE_API_VERSION } from './api-version';

type AuthTokenCreateParams = Parameters<GoogleGenAI['authTokens']['create']>[0];
type AuthTokenConfig = NonNullable<AuthTokenCreateParams['config']>;
type LiveConnectConstraints = NonNullable<
  AuthTokenConfig['liveConnectConstraints']
>;

type LiveTokenBuilderParams = {
  model: string;
  systemInstruction?: string;
  tools?: unknown[];
  toolConfig?: unknown;
  responseModalities?: Modality[];
  voiceName?: string;
  thinkingLevel?: ThinkingLevel;
  sessionHandle?: string;
};

export const LIVE_TOKEN_LIFETIME_MS = 5 * 60 * 1000;

export function buildCreateAuthTokenConfig({
  model,
  systemInstruction,
  tools,
  toolConfig,
  responseModalities,
  voiceName,
  thinkingLevel,
}: LiveTokenBuilderParams): AuthTokenCreateParams['config'] {
  const expireTime = new Date(
    Date.now() + LIVE_TOKEN_LIFETIME_MS
  ).toISOString();

  return {
    uses: 1,
    expireTime,
    liveConnectConstraints: buildLiveConnectConfig({
      model,
      systemInstruction,
      tools,
      toolConfig,
      responseModalities,
      voiceName,
      thinkingLevel,
    }),
    lockAdditionalFields: [],
    httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
  };
}

export function buildLiveConnectConfig({
  model,
  systemInstruction,
  tools,
  toolConfig,
  responseModalities = [Modality.AUDIO],
  voiceName = 'Aoede',
  thinkingLevel = ThinkingLevel.MINIMAL,
  sessionHandle,
}: LiveTokenBuilderParams): LiveConnectConstraints {
  return {
    model,
    config: {
      responseModalities,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: {
        triggerTokens: '25000',
        slidingWindow: { targetTokens: '8000' },
      },
      sessionResumption: sessionHandle == null ? {} : { handle: sessionHandle },
      thinkingConfig: {
        thinkingLevel,
      },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
      ...(systemInstruction == null
        ? {}
        : {
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
          }),
      ...(tools == null ? {} : { tools }),
      ...(toolConfig == null ? {} : { toolConfig }),
    },
  } as LiveConnectConstraints;
}

export async function createConstrainedLiveToken({
  model,
  systemInstruction,
  tools,
  toolConfig,
  responseModalities,
  voiceName,
  thinkingLevel,
}: LiveTokenBuilderParams): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (apiKey == null || apiKey.trim().length === 0) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured');
  }

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
  });

  const token = await client.authTokens.create({
    config: buildCreateAuthTokenConfig({
      model,
      systemInstruction,
      tools,
      toolConfig,
      responseModalities,
      voiceName,
      thinkingLevel,
    }),
  });

  if (token.name == null || token.name.trim().length === 0) {
    throw new Error('Gemini auth token response did not include a token name');
  }

  return token.name;
}
