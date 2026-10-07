// Upstream error text is untrusted. Only this fixed public message crosses
// the native Chat boundary, including for unknown or malformed error payloads.
export class AiStreamError extends Error {
  readonly code = 'ai_response_unavailable';

  constructor() {
    super('AI response unavailable');
    this.name = 'AiStreamError';
  }
}
