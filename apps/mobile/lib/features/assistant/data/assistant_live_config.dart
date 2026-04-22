const assistantLiveModelId = 'gemini-3.1-flash-live-preview';
const assistantLiveModelLabel = 'Gemini 3.1 Flash Live';

bool assistantLiveModelMatches(String? modelId) {
  if (modelId == null || modelId.isEmpty) {
    return false;
  }
  return modelId == assistantLiveModelId ||
      modelId.endsWith('/$assistantLiveModelId');
}
