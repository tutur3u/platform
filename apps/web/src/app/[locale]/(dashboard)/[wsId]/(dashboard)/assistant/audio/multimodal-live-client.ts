import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import { EventEmitter } from 'eventemitter3';
import { GEMINI_LIVE_API_VERSION } from '@/lib/live/api-version';
import { createLiveConnectionError } from '@/lib/live/errors';
import type {
  LiveConfig,
  ServerContent,
  SessionResumptionUpdate,
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  ToolResponseMessage,
} from '../multimodal-live';

export function resolveLiveResponseModalities(config: LiveConfig): Modality[] {
  if (
    Array.isArray(config.responseModalities) &&
    config.responseModalities.length > 0
  ) {
    return config.responseModalities;
  }

  const legacy = (
    config.generationConfig as { responseModalities?: unknown } | undefined
  )?.responseModalities;

  const legacyList = Array.isArray(legacy)
    ? legacy
    : typeof legacy === 'string'
      ? [legacy]
      : [];

  const mapped: Modality[] = [];
  for (const entry of legacyList) {
    const normalized = String(entry).toLowerCase();
    if (normalized === 'audio') mapped.push(Modality.AUDIO);
    else if (normalized === 'text') mapped.push(Modality.TEXT);
    else if (normalized === 'image') mapped.push(Modality.IMAGE);
  }

  return mapped.length > 0 ? mapped : [Modality.AUDIO];
}

export function shouldTreatMissingMimeTypeAsAudio(
  modalities: Modality[]
): boolean {
  return modalities.length === 1 && modalities[0] === Modality.AUDIO;
}

/**
 * Grounding metadata from Google Search
 */
export interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title: string;
    };
  }>;
  groundingSupports?: Array<{
    segment?: {
      startIndex?: number;
      endIndex?: number;
      text?: string;
    };
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }>;
  searchEntryPoint?: {
    renderedContent?: string;
  };
}

/**
 * Events emitted by the client
 */
interface MultimodalLiveClientEventTypes {
  open: () => void;
  log: (log: StreamingLog) => void;
  close: (event: { reason: string }) => void;
  error: (error: Error) => void;
  audio: (data: ArrayBuffer) => void;
  content: (data: ServerContent) => void;
  transcription: (text: string) => void;
  inputtranscription: (text: string) => void;
  interrupted: () => void;
  setupcomplete: () => void;
  turncomplete: () => void;
  toolcall: (toolCall: ToolCall) => void;
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void;
  groundingmetadata: (metadata: GroundingMetadata) => void;
  usage: (metadata: UsageMetadata) => void;
  // Session management events
  goaway: (data: { timeLeft?: string }) => void;
  generationcomplete: () => void;
  sessionresumptionupdate: (data: SessionResumptionUpdate) => void;
}

export type MultimodalLiveAPIClientConnection = {
  url?: string;
  apiKey: string;
};

/**
 * Client for Google's Gemini Live API using @google/genai SDK
 */
export class MultimodalLiveClient extends EventEmitter<MultimodalLiveClientEventTypes> {
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private connectionGeneration = 0;
  private cancelPending: (() => void) | null = null;
  protected config: LiveConfig | null = null;
  public url: string = '';
  private responseModalities: Modality[] = [Modality.AUDIO];

  // Expose ws-like property for compatibility checks
  public get ws(): Session | null {
    return this.session;
  }

  constructor({ apiKey }: MultimodalLiveAPIClientConnection) {
    super();
    // Token provisioning and the constrained websocket must use the same API.
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
    });
    this.send = this.send.bind(this);
  }

  getConfig() {
    return { ...this.config };
  }

  log(type: string, message: StreamingLog['message']) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message,
    };
    this.emit('log', log);
  }

  async connect(config: LiveConfig): Promise<boolean> {
    this.cancelPending?.();
    const generation = ++this.connectionGeneration;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    this.config = config;

    // Debug: Log the full config including tools
    console.log('[Live API] Full config received:', {
      model: config.model,
      hasSystemInstruction: !!config.systemInstruction,
      hasTools: !!config.tools,
      toolsCount: config.tools?.length || 0,
      tools: config.tools ? JSON.stringify(config.tools, null, 2) : 'none',
    });

    try {
      // Build SDK config matching official example
      // See: https://ai.google.dev/gemini-api/docs/live-tools
      const sdkConfig: Record<string, unknown> = {};

      // Resolve response modalities.
      // - Prefer the new top-level config.responseModalities
      // - Fallback to legacy generationConfig.responseModalities
      // - Default to audio
      const resolvedModalities = resolveLiveResponseModalities(config);
      this.responseModalities = resolvedModalities;

      sdkConfig.responseModalities = resolvedModalities;

      // Add system instruction (CRITICAL for guiding tool usage)
      if (config.systemInstruction) {
        sdkConfig.systemInstruction = config.systemInstruction;
      }

      // Add tools (matching official example format)
      if (config.tools) {
        sdkConfig.tools = config.tools;
      }

      // Add tool config for function calling behavior
      if (config.toolConfig) {
        sdkConfig.toolConfig = config.toolConfig;
      }

      // Add generation config if provided (excluding legacy responseModalities)
      if (config.generationConfig) {
        const generationConfig = {
          ...(config.generationConfig as Record<string, unknown>),
        };
        if ('responseModalities' in generationConfig) {
          delete generationConfig.responseModalities;
        }
        if (Object.keys(generationConfig).length > 0) {
          sdkConfig.generationConfig = generationConfig;
        }
      }

      if (config.sessionResumption) {
        sdkConfig.sessionResumption = config.sessionResumption;
      }

      if (config.historyConfig) {
        sdkConfig.historyConfig = config.historyConfig;
      }

      // Detect ephemeral token usage: no tools/systemInstruction in client config
      // When using ephemeral tokens, these are embedded in the token itself.
      // Passing config here would OVERRIDE the token's embedded configuration.
      const isUsingEphemeralToken =
        !config.tools && !config.systemInstruction && !config.toolConfig;

      console.log('[Live API] Connecting with config:', {
        model: config.model,
        isUsingEphemeralToken,
        hasSystemInstruction: !!sdkConfig.systemInstruction,
        hasTools: !!sdkConfig.tools,
        hasToolConfig: !!sdkConfig.toolConfig,
        toolsCount: Array.isArray(config.tools) ? config.tools.length : 0,
      });

      // When using ephemeral token, pass model only - let token provide the rest
      // Otherwise, pass full config for regular API key mode
      let rejectConnection: (error: Error) => void = () => {};
      let connectionSettled = false;
      const connectionFailure = new Promise<never>((_, reject) => {
        rejectConnection = reject;
      });
      const failConnection = (error: Error) => {
        if (!connectionSettled) rejectConnection(error);
      };

      const cancel = () =>
        failConnection(createLiveConnectionError('Live connection cancelled'));
      this.cancelPending = cancel;
      timeout = setTimeout(
        () =>
          failConnection(
            createLiveConnectionError('Live connection timed out')
          ),
        15000
      );
      const connection = this.ai.live.connect({
        model: config.model,
        ...(isUsingEphemeralToken
          ? config.sessionResumption
            ? { config: { sessionResumption: config.sessionResumption } }
            : {}
          : { config: sdkConfig }),
        callbacks: {
          onopen: () => {
            if (generation !== this.connectionGeneration) return;
            this.log('client.open', 'connected to Gemini Live');
            this.emit('open');
          },
          onmessage: (message: LiveServerMessage) => {
            if (generation === this.connectionGeneration)
              this.handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            if (generation !== this.connectionGeneration) return;
            console.error('[Live API] Error:', {
              message: e.message,
              type: e.type,
              error: e,
            });
            const error = createLiveConnectionError(e.message, e);
            this.log('server.error', error.message);
            if (connectionSettled) this.emit('error', error);
            failConnection(error);
          },
          onclose: (event: {
            code: number;
            reason: string;
            wasClean: boolean;
          }) => {
            if (generation !== this.connectionGeneration) return;
            console.log('[Live API] Connection closed:', {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            });
            this.log(
              'server.close',
              `disconnected: ${event.reason || 'unknown'}`
            );
            this.session = null;
            this.emit('close', { reason: event.reason });
            failConnection(createLiveConnectionError(event.reason));
          },
        },
      });

      void connection
        .then((session) => {
          if (generation !== this.connectionGeneration) session.close();
        })
        .catch(() => undefined);
      const session = await Promise.race([connection, connectionFailure]);
      if (this.cancelPending === cancel) this.cancelPending = null;
      if (generation !== this.connectionGeneration) {
        session.close();
        throw new Error('Live connection cancelled');
      }
      this.session = session;
      connectionSettled = true;
      this.log('server.send', 'setupComplete');
      this.emit('setupcomplete');

      return true;
    } catch (error) {
      if (generation === this.connectionGeneration) {
        this.connectionGeneration++;
        this.cancelPending = null;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.log('client.error', err.message);
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private handleMessage(message: LiveServerMessage) {
    if (message.usageMetadata) {
      this.log(
        'server.usageMetadata',
        `total tokens: ${message.usageMetadata.totalTokenCount ?? 0}`
      );
      this.emit('usage', message.usageMetadata);
    }

    // Handle goAway message (server requesting graceful disconnection)
    const goAwayMsg = message as unknown as { goAway?: { timeLeft?: string } };
    if (goAwayMsg.goAway) {
      const timeLeft = goAwayMsg.goAway.timeLeft;
      this.log('server.goaway', `Time left: ${timeLeft || 'unknown'}`);
      this.emit('goaway', { timeLeft });
    }

    // Handle session resumption update (provides handle for reconnection)
    const sessionMsg = message as unknown as {
      sessionResumptionUpdate?: { resumable: boolean; newHandle?: string };
    };
    if (sessionMsg.sessionResumptionUpdate) {
      const update = sessionMsg.sessionResumptionUpdate;
      this.log(
        'server.sessionresumption',
        `Resumable: ${update.resumable}, Handle: ${update.newHandle ? 'provided' : 'none'}`
      );
      this.emit('sessionresumptionupdate', update);
    }

    // Handle tool calls
    if (message.toolCall) {
      const toolCall: ToolCall = {
        functionCalls:
          message.toolCall.functionCalls?.map((fc) => ({
            name: fc.name || '',
            id: fc.id || '',
            args: fc.args || {},
          })) || [],
      };
      this.emit('toolcall', toolCall);
    }

    // Handle tool call cancellation
    if (message.toolCallCancellation) {
      this.log(
        'server.toolCallCancellation',
        JSON.stringify(message.toolCallCancellation)
      );
      this.emit('toolcallcancellation', {
        ids: message.toolCallCancellation.ids || [],
      });
    }

    // Handle server content
    if (message.serverContent) {
      const serverContent = message.serverContent;

      // PRIORITY: Handle grounding metadata FIRST so search results appear immediately
      // This ensures users see what was searched before hearing the full response
      const groundingMetadata = (
        serverContent as { groundingMetadata?: GroundingMetadata }
      ).groundingMetadata;
      if (groundingMetadata) {
        this.emit('groundingmetadata', groundingMetadata);
      }

      if (serverContent.inputTranscription?.text) {
        this.emit('inputtranscription', serverContent.inputTranscription.text);
      }

      // Check for interruption
      if (serverContent.interrupted) {
        this.log('server.interrupted', 'generation interrupted');
        this.emit('interrupted');
        return;
      }

      // Handle model turn with parts
      if (serverContent.modelTurn?.parts) {
        const parts = serverContent.modelTurn.parts;

        const configuredAudioOnly = shouldTreatMissingMimeTypeAsAudio(
          this.responseModalities
        );

        // Extract audio parts
        for (const part of parts) {
          const base64 = part.inlineData?.data;
          if (!base64) continue;

          // Latest examples may omit inlineData.mimeType for audio.
          // If we're in audio-only mode, treat missing mimeType as audio.
          const mimeType = part.inlineData?.mimeType;
          const isAudio =
            typeof mimeType === 'string'
              ? mimeType.startsWith('audio/')
              : configuredAudioOnly;

          if (!isAudio) continue;

          const data = this.base64ToArrayBuffer(base64);
          this.emit('audio', data);
          this.log('server.audio', `buffer (${data.byteLength})`);
        }

        // Extract text parts, filtering out "thought" content (internal model reasoning)
        const textParts = parts
          .filter(
            (p: {
              text?: string;
              thought?: boolean;
              inlineData?: { mimeType?: string; data?: string };
            }) =>
              // Include if has text AND is not a "thought" (internal reasoning)
              (p.text && !p.thought) ||
              // If inlineData exists, only include it as "text" when it isn't audio.
              // (When mimeType is missing and we're audio-only, treat it as audio and exclude.)
              (p.inlineData &&
                (typeof p.inlineData.mimeType === 'string'
                  ? !p.inlineData.mimeType.startsWith('audio/')
                  : !configuredAudioOnly))
          )
          .map((p: { text?: string }) => ({ text: p.text || '' }));
        if (textParts.length > 0) {
          this.emit('content', {
            modelTurn: { parts: textParts },
          } as ServerContent);
          this.log('server.content', JSON.stringify(textParts));
        }
      }

      // Handle output transcription (what the assistant actually says)
      if (serverContent.outputTranscription?.text) {
        const text = serverContent.outputTranscription.text;
        this.emit('transcription', text);
      }

      // Check for turn complete
      if (serverContent.turnComplete) {
        this.log('server.turncomplete', 'turn complete');
        this.emit('turncomplete');
      }

      // Check for generation complete (model finished generating all output)
      const contentWithComplete = serverContent as unknown as {
        generationComplete?: boolean;
      };
      if (contentWithComplete.generationComplete) {
        this.log('server.generationcomplete', 'generation complete');
        this.emit('generationcomplete');
      }
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  disconnect(_session?: Session) {
    this.cancelPending?.();
    this.cancelPending = null;
    this.connectionGeneration++;
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // Ignore errors during close
      }
      this.session = null;
      this.log('client.close', 'Disconnected');
      return true;
    }
    return false;
  }

  sendAudioStreamEnd() {
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  /**
   * Send realtime audio/video input
   */
  sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>) {
    if (!this.session) {
      throw new Error('Session is not connected');
    }

    let hasAudio = false;
    let hasVideo = false;

    for (const chunk of chunks) {
      if (chunk.mimeType.includes('audio')) {
        hasAudio = true;
        this.session.sendRealtimeInput({
          audio: {
            data: chunk.data,
            mimeType: chunk.mimeType,
          },
        });
      }
      if (chunk.mimeType.includes('image')) {
        hasVideo = true;
        this.session.sendRealtimeInput({
          video: {
            data: chunk.data,
            mimeType: chunk.mimeType,
          },
        });
      }
    }

    const message =
      hasAudio && hasVideo
        ? 'audio + video'
        : hasAudio
          ? 'audio'
          : hasVideo
            ? 'video'
            : 'unknown';
    if (hasVideo) {
      this.log('client.realtimeInput', message);
    }
  }

  /**
   * Send a tool response
   * Format matches Google GenAI SDK: { id, name, response }
   * See: https://ai.google.dev/gemini-api/docs/live-tools
   */
  sendToolResponse(toolResponse: ToolResponseMessage['toolResponse']) {
    if (!this.session) {
      throw new Error('Session is not connected');
    }

    // Format function responses according to Google SDK requirements
    // See: https://ai.google.dev/gemini-api/docs/live-tools
    // Format: { id, name, response: { result: ... } }
    const formattedResponses = toolResponse.functionResponses.map((fr) => {
      // Clean the response - remove visualization (frontend-only) data to keep response smaller
      // The AI only needs the data to speak about, not the UI rendering instructions
      let cleanResponse = fr.response;
      if (typeof cleanResponse === 'object' && cleanResponse !== null) {
        const resp = cleanResponse as Record<string, unknown>;
        // Remove visualization object - that's for frontend only
        if ('visualization' in resp) {
          const { visualization: _, ...dataForAI } = resp;
          cleanResponse = dataForAI;
        }
      }

      // Match Google's example format: response: { result: ... }
      return {
        id: fr.id,
        name: fr.name,
        response: { result: cleanResponse },
      };
    });

    this.session.sendToolResponse({
      functionResponses: formattedResponses,
    });
    this.log(
      'client.toolResponse',
      `${formattedResponses.length} tool responses`
    );
  }

  /**
   * Send text or content
   * Uses proper Content format for tool calling compatibility
   */
  send(
    parts: { text?: string } | Array<{ text?: string }>,
    _turnComplete: boolean = true
  ) {
    if (!this.session) {
      throw new Error('Session is not connected');
    }

    const partsArray = Array.isArray(parts) ? parts : [parts];
    const text = partsArray.map((p) => p.text || '').join('');

    this.session.sendRealtimeInput({
      text,
    });
    this.log('client.send', text);
  }
}
