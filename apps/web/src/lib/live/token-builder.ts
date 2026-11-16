import { GoogleGenAI, Modality, type ThinkingLevel } from '@google/genai';
import { GEMINI_LIVE_API_VERSION } from './api-version';
import {
  getLiveContextWindowCompression,
  getLiveThinkingConfig,
} from './models';

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
  allowResumption?: boolean;
  expiresAt?: string;
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
  allowResumption = true,
  expiresAt,
}: LiveTokenBuilderParams): AuthTokenCreateParams['config'] {
  const now = Date.now();
  const expiresMs =
    expiresAt == null ? now + LIVE_TOKEN_LIFETIME_MS : Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now) {
    throw new Error('Invalid Live token expiry');
  }
  const expireTime = new Date(expiresMs).toISOString();

  return {
    uses: 1,
    expireTime,
    newSessionExpireTime: new Date(
      Math.min(expiresMs - 1, now + 30_000)
    ).toISOString(),
    ...(allowResumption ? {} : { lockAdditionalFields: ['sessionResumption'] }),
    liveConnectConstraints: buildLiveConnectConfig({
      model,
      systemInstruction,
      tools,
      toolConfig,
      responseModalities,
      voiceName,
      thinkingLevel,
      allowResumption,
    }),
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
  thinkingLevel,
  sessionHandle,
  allowResumption = true,
}: LiveTokenBuilderParams): LiveConnectConstraints {
  return {
    model,
    config: {
      responseModalities,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: getLiveContextWindowCompression(model),
      ...(allowResumption
        ? {
            sessionResumption:
              sessionHandle == null ? {} : { handle: sessionHandle },
          }
        : {}),
      ...getLiveThinkingConfig(model, thinkingLevel),
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
  allowResumption,
  expiresAt,
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
      allowResumption,
      expiresAt,
    }),
  });

  if (token.name == null || token.name.trim().length === 0) {
    throw new Error('Gemini auth token response did not include a token name');
  }

  return token.name;
}
