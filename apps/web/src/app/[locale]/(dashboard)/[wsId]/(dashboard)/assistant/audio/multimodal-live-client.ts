import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
} from '@google/genai';
import { EventEmitter } from 'eventemitter3';
import type {
  LiveConfig,
  ServerContent,
  SessionResumptionUpdate,
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  ToolResponseMessage,
} from '../multimodal-live';

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
  interrupted: () => void;
  setupcomplete: () => void;
  turncomplete: () => void;
  toolcall: (toolCall: ToolCall) => void;
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void;
  groundingmetadata: (metadata: GroundingMetadata) => void;
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
  protected config: LiveConfig | null = null;
  public url: string = '';

  // Expose ws-like property for compatibility checks
  public get ws(): Session | null {
    return this.session;
  }

  constructor({ apiKey }: MultimodalLiveAPIClientConnection) {
    super();
    // v1alpha is REQUIRED for ephemeral token support
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
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
      const sdkConfig: Record<string, unknown> = {
        responseModalities: [Modality.AUDIO],
      };

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
      this.session = await this.ai.live.connect({
        model: config.model,
        ...(isUsingEphemeralToken ? {} : { config: sdkConfig }),
        callbacks: {
          onopen: () => {
            this.log('client.open', 'connected to Gemini Live');
            this.emit('open');
            // Emit setup complete after connection
            this.log('server.send', 'setupComplete');
            this.emit('setupcomplete');
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error('[Live API] Error:', {
              message: e.message,
              type: e.type,
              error: e,
            });
            const error = new Error(e.message || 'Connection error');
            this.log('server.error', error.message);
            this.emit('error', error);
          },
          onclose: (event: {
            code: number;
            reason: string;
            wasClean: boolean;
          }) => {
            console.log('[Live API] Connection closed:', {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            });
            this.log(
              'server.close',
              `disconnected: ${event.reason || 'unknown'}`
            );
            this.emit('close', { reason: event.reason });
            this.session = null;
          },
        },
      });

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.log('client.error', err.message);
      this.emit('error', err);
      throw err;
    }
  }

  private handleMessage(message: LiveServerMessage) {
    // Log all incoming messages for debugging
    console.log(
      '[Live API] Message received:',
      JSON.stringify(message, null, 2).slice(0, 500)
    );

    // Handle goAway message (server requesting graceful disconnection)
    const goAwayMsg = message as unknown as { goAway?: { timeLeft?: string } };
    if (goAwayMsg.goAway) {
      const timeLeft = goAwayMsg.goAway.timeLeft;
      this.log('server.goaway', `Time left: ${timeLeft || 'unknown'}`);
      this.emit('goaway', { timeLeft });
      return;
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
      return;
    }

    // Handle tool calls
    if (message.toolCall) {
      console.log(
        '[Live API] TOOL CALL DETECTED:',
        JSON.stringify(message.toolCall, null, 2)
      );
      this.log('server.toolCall', JSON.stringify(message.toolCall));
      const toolCall: ToolCall = {
        functionCalls:
          message.toolCall.functionCalls?.map((fc) => ({
            name: fc.name || '',
            id: fc.id || '',
            args: fc.args || {},
          })) || [],
      };
      this.emit('toolcall', toolCall);
      return;
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
      return;
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
        console.log('[Live API] ========== GOOGLE SEARCH RESULTS ==========');
        console.log(
          '[Live API] Search queries:',
          groundingMetadata.webSearchQueries
        );
        console.log(
          '[Live API] Number of sources:',
          groundingMetadata.groundingChunks?.length || 0
        );
        console.log('[Live API] Sources:');
        groundingMetadata.groundingChunks?.forEach((chunk, i) => {
          if (chunk.web) {
            console.log(`  [${i}] ${chunk.web.title}`);
            console.log(`      URL: ${chunk.web.uri}`);
          }
        });
        console.log('[Live API] Grounding supports (text segments):');
        groundingMetadata.groundingSupports?.forEach((support, i) => {
          console.log(
            `  [${i}] Text: "${support.segment?.text?.slice(0, 100)}${(support.segment?.text?.length || 0) > 100 ? '...' : ''}"`
          );
          console.log(
            `      From sources: ${support.groundingChunkIndices?.join(', ')}`
          );
          console.log(
            `      Confidence: ${support.confidenceScores?.join(', ')}`
          );
        });
        console.log(
          '[Live API] Full grounding metadata:',
          JSON.stringify(groundingMetadata, null, 2)
        );
        console.log('[Live API] ============================================');
        this.log('server.groundingMetadata', JSON.stringify(groundingMetadata));
        this.emit('groundingmetadata', groundingMetadata);
      }

      // Check for interruption
      if (serverContent.interrupted) {
        this.log('server.interrupted', 'generation interrupted');
        this.emit('interrupted');
        return;
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

      // Handle model turn with parts
      if (serverContent.modelTurn?.parts) {
        const parts = serverContent.modelTurn.parts;

        // Extract audio parts
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            const base64 = part.inlineData.data;
            if (base64) {
              const data = this.base64ToArrayBuffer(base64);
              this.emit('audio', data);
              this.log('server.audio', `buffer (${data.byteLength})`);
            }
          }
        }

        // Extract text parts, filtering out "thought" content (internal model reasoning)
        const textParts = parts
          .filter(
            (p: {
              text?: string;
              thought?: boolean;
              inlineData?: { mimeType?: string };
            }) =>
              // Include if has text AND is not a "thought" (internal reasoning)
              (p.text && !p.thought) ||
              (p.inlineData && !p.inlineData.mimeType?.startsWith('audio/'))
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
        this.log('server.transcription', text);
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
        // Log video frame being sent (truncate data for logging)
        console.log('[Live Client] Sending video frame:', {
          mimeType: chunk.mimeType,
          dataLength: chunk.data.length,
          dataPreview: chunk.data.slice(0, 50) + '...',
        });
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

    console.log(
      '[Live Client] Sending tool response:',
      JSON.stringify(formattedResponses, null, 2).slice(0, 2000)
    );

    this.session.sendToolResponse({
      functionResponses: formattedResponses,
    });
    this.log('client.toolResponse', JSON.stringify(toolResponse));
  }

  /**
   * Send text or content
   * Uses proper Content format for tool calling compatibility
   */
  send(
    parts: { text?: string } | Array<{ text?: string }>,
    turnComplete: boolean = true
  ) {
    if (!this.session) {
      throw new Error('Session is not connected');
    }

    const partsArray = Array.isArray(parts) ? parts : [parts];
    const text = partsArray.map((p) => p.text || '').join('');

    // Use proper Content format - turns must be Content[] not string
    // This is required for function calling to work
    this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete,
    });
    this.log('client.send', text);
  }
}
