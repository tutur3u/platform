/** Gemini native search emits server tools rather than the registered tool name. */
export function isGoogleSearchToolName(name: string | undefined) {
  return name === 'google_search' || name === 'server:GOOGLE_SEARCH_WEB';
}
