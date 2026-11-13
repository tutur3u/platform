import { smoothStream } from 'ai';

const WORD_CHUNK = /\S+\s+/m;

type DeltaType = 'text-delta' | 'reasoning-delta';

type StreamChunk = {
  type: string;
  id?: string;
  text?: string;
  providerMetadata?: unknown;
};

function isDelta(
  chunk: StreamChunk
): chunk is StreamChunk & { type: DeltaType; id: string; text: string } {
  return chunk.type === 'text-delta' || chunk.type === 'reasoning-delta';
}

/**
 * Emits the first text delta as soon as it arrives. Later text still breaks on
 * word boundaries, with no inter-chunk delay.
 */
export function miraImmediateFirstTextTransform(): ReturnType<
  typeof smoothStream
> {
  return () => {
    let releasedFirstText = false;
    let buffer = '';
    let id = '';
    let type: DeltaType | undefined;
    let providerMetadata: unknown;

    function enqueueDelta(
      controller: TransformStreamDefaultController<StreamChunk>,
      text: string
    ) {
      if (type === undefined) return;
      controller.enqueue({
        type,
        text,
        id,
        ...(providerMetadata != null ? { providerMetadata } : {}),
      });
    }

    function flushPartial(
      controller: TransformStreamDefaultController<StreamChunk>
    ) {
      if (
        type !== undefined &&
        (buffer.length > 0 || providerMetadata != null)
      ) {
        enqueueDelta(controller, buffer);
        buffer = '';
        providerMetadata = undefined;
      }
    }

    function emitCompleteWords(
      controller: TransformStreamDefaultController<StreamChunk>
    ) {
      let match: RegExpExecArray | null;
      while ((match = WORD_CHUNK.exec(buffer))) {
        const text = buffer.slice(0, match.index) + match[0];
        enqueueDelta(controller, text);
        buffer = buffer.slice(text.length);
        if (buffer.length === 0) providerMetadata = undefined;
      }
    }

    return new TransformStream<StreamChunk, StreamChunk>({
      transform(chunk, controller) {
        if (
          !releasedFirstText &&
          chunk.type === 'text-delta' &&
          typeof chunk.text === 'string' &&
          chunk.text.length > 0
        ) {
          flushPartial(controller);
          releasedFirstText = true;
          controller.enqueue(chunk);
          return;
        }

        if (!isDelta(chunk)) {
          flushPartial(controller);
          controller.enqueue(chunk);
          return;
        }

        if (chunk.text.length === 0 && chunk.providerMetadata != null) {
          flushPartial(controller);
          controller.enqueue(chunk);
          return;
        }

        if (
          buffer.length > 0 &&
          (chunk.type !== type ||
            chunk.id !== id ||
            providerMetadata != null ||
            chunk.providerMetadata != null)
        ) {
          flushPartial(controller);
        }

        buffer += chunk.text;
        id = chunk.id;
        type = chunk.type;
        providerMetadata = chunk.providerMetadata;
        emitCompleteWords(controller);
      },
    }) as ReturnType<ReturnType<typeof smoothStream>>;
  };
}
