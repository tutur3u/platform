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
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  ToolResponseMessage,
} from '../multimodal-live';

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

      console.log('[Live API] Connecting with config:', {
        model: config.model,
        hasSystemInstruction: !!sdkConfig.systemInstruction,
        hasTools: !!sdkConfig.tools,
        hasToolConfig: !!sdkConfig.toolConfig,
        toolsCount: Array.isArray(config.tools) ? config.tools.length : 0,
      });

      this.session = await this.ai.live.connect({
        model: config.model,
        config: sdkConfig,
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
    this.log('client.realtimeInput', message);
  }

  /**
   * Send a tool response
   */
  sendToolResponse(toolResponse: ToolResponseMessage['toolResponse']) {
    if (!this.session) {
      throw new Error('Session is not connected');
    }

    this.session.sendToolResponse({
      functionResponses: toolResponse.functionResponses.map((fr) => ({
        id: fr.id,
        response: fr.response as Record<string, unknown>,
      })),
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
