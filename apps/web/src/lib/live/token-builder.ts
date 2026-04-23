import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';

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
      contextWindowCompression: { slidingWindow: {} },
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
}: LiveTokenBuilderParams) {
  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const token = await client.authTokens.create({
    config: {
      uses: 100,
      expireTime,
      newSessionExpireTime: expireTime,
      liveConnectConstraints: buildLiveConnectConfig({
        model,
        systemInstruction,
        tools,
        toolConfig,
        responseModalities,
        voiceName,
        thinkingLevel,
      }),
    },
  });

  return token.name;
}
