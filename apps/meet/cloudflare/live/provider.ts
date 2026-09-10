import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
  ThinkingLevel,
} from '@google/genai/web';
import {
  buildLiveInstructions,
  type LiveContextJournal,
} from '../../src/features/live-assistant/context';
import {
  type LiveSessionClaims,
  MEET_LIVE_MODEL,
} from '../../src/features/live-assistant/contracts';
import { type LiveEnvironment, readLiveMemory } from './storage';
import { liveTools } from './tools';

export async function connectLiveProvider(input: {
  env: LiveEnvironment;
  claims: LiveSessionClaims;
  timezone: string;
  voice?: string;
  sharedContext: string;
  journal: LiveContextJournal;
  handle?: string;
  workspaceTools?: import('@google/genai/web').FunctionDeclaration[];
  onMessage: (message: LiveServerMessage) => void;
  onClose: () => void;
}): Promise<Session> {
  const memory = await readLiveMemory(input.env, input.claims);
  const client = new GoogleGenAI({
    apiKey: input.env.GOOGLE_GENERATIVE_AI_API_KEY,
    httpOptions: { apiVersion: 'v1beta' },
  });
  let session: Session | undefined;
  let abandoned = false;
  let ready!: () => void;
  let failed!: (error: Error) => void;
  const setup = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const timer = setTimeout(
    () => failed(new Error('live_setup_timeout')),
    20000
  );
  const connection = client.live
    .connect({
      model: MEET_LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        maxOutputTokens: 1024,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: input.voice ?? 'Aoede' },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: {
          triggerTokens: '25000',
          slidingWindow: { targetTokens: '8000' },
        },
        sessionResumption: input.handle ? { handle: input.handle } : {},
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction:
          buildLiveInstructions({
            mode: input.claims.mode,
            now: new Date().toISOString(),
            timezone: input.timezone,
            memoryEnabled: memory.enabled,
            memories: memory.memories,
            sharedContext: input.sharedContext,
            journal: input.journal,
          }) +
          `\nRecent session turns (conversation data): ${JSON.stringify(input.journal.turns.slice(-16))}`,
        tools: [
          {
            functionDeclarations: [
              ...liveTools(input.claims.mode, memory.enabled),
              ...(input.claims.mode === 'personal'
                ? (input.workspaceTools ?? [])
                : []),
            ],
          },
          { googleSearch: {} },
        ],
      },
      callbacks: {
        onmessage: (message) => {
          if (abandoned) return;
          if (message.setupComplete) ready();
          input.onMessage(message);
        },
        onclose: () => {
          failed(new Error('live_setup_closed'));
          if (!abandoned) input.onClose();
        },
        onerror: () => {
          failed(new Error('live_setup_failed'));
          if (!abandoned) input.onClose();
        },
      },
    })
    .then((connected) => {
      session = connected;
      if (abandoned) connected.close();
      return connected;
    });
  try {
    const [connected] = await Promise.all([connection, setup]);
    return connected;
  } catch (error) {
    abandoned = true;
    session?.close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Keep final usage callbacks alive briefly after ending input, then close transport. */
export async function drainLiveProvider(provider: Session | undefined) {
  if (!provider) return;
  try {
    provider.sendRealtimeInput({ audioStreamEnd: true });
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    provider.close();
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
