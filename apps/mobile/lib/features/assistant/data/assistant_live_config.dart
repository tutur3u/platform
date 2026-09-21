const assistantLiveModelId = 'gemini-3.8-live';
const assistantLiveModelLabel = 'Gemini 3.8 Live';

bool assistantLiveModelMatches(String? modelId) {
  if (modelId == null || modelId.isEmpty) {
    return false;
  }
  return modelId == 'gemini-3.1-flash-live-preview' ||
      modelId.endsWith('/gemini-3.1-flash-live-preview') ||
      modelId == assistantLiveModelId ||
      modelId.endsWith('/$assistantLiveModelId');
}
