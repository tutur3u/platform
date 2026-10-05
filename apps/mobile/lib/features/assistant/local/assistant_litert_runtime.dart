import 'package:flutter_edge_ai/core/registry/runtime_config.dart';
import 'package:flutter_edge_ai/flutter_edge_ai.dart';
import 'package:flutter_edge_ai_litertlm/flutter_edge_ai_litertlm.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';

/// Direct engine creation avoids the plugin's global active-model preference.
/// Only a previously verified, app-owned file path is supplied by the manager.
Future<LocalInferenceModel> loadAssistantLiteRtModel(
  String verifiedPath,
) async {
  final model = await const LiteRtLmEngine().createModel(
    InferenceModelSpec(
      name: 'Mira local text',
      modelSource: FileSource(verifiedPath),
      modelType: ModelType.general,
      fileType: ModelFileType.litertlm,
    ),
    RuntimeConfig(
      maxTokens: 2048,
      modelPath: verifiedPath,
      preferredBackend: PreferredBackend.cpu,
      maxConcurrentSessions: 1,
    ),
  );
  return _LiteRtModel(model);
}

class _LiteRtModel implements LocalInferenceModel {
  _LiteRtModel(this.model);
  final InferenceModel model;

  @override
  Future<LocalInferenceSession> session() async =>
      _LiteRtSession(await model.createSession(maxOutputTokens: 256));

  @override
  Future<void> close() => model.close();
}

class _LiteRtSession implements LocalInferenceSession {
  _LiteRtSession(this.session);
  final InferenceModelSession session;

  @override
  Future<void> add(LocalChatTurn turn) =>
      session.addQueryChunk(Message.text(text: turn.text, isUser: turn.isUser));

  @override
  Stream<String> generate() => session.getResponseAsync();

  @override
  Future<void> stop() => session.stopGeneration();

  @override
  Future<void> close() => session.close();
}
