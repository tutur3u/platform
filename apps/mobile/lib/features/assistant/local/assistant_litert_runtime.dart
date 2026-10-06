import 'dart:io';

import 'package:flutter_edge_ai/core/registry/runtime_config.dart';
import 'package:flutter_edge_ai/flutter_edge_ai.dart';
import 'package:flutter_edge_ai_litertlm/flutter_edge_ai_litertlm.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';

typedef AssistantNativeModelFactory =
    Future<InferenceModel> Function(
      InferenceModelSpec spec,
      RuntimeConfig config,
    );

/// Direct engine creation avoids the plugin's global active-model preference.
/// Only a previously verified, app-owned file path is supplied by the manager.
Future<LocalInferenceModel> loadAssistantLiteRtModel(
  String verifiedPath, {
  AssistantNativeModelFactory? createModel,
}) async {
  final filename = File(verifiedPath).uri.pathSegments.last;
  final matches = assistantLocalModels.where(
    (model) => filename == '${model.id}.litertlm',
  );
  if (matches.length != 1) {
    throw ArgumentError('Unknown app-owned local model');
  }
  final configuration = matches.single;
  final model = await (createModel ?? const LiteRtLmEngine().createModel)(
    InferenceModelSpec(
      name: configuration.name,
      modelSource: FileSource(verifiedPath),
      modelType: ModelType.general,
      fileType: ModelFileType.litertlm,
    ),
    RuntimeConfig(
      maxTokens: configuration.contextTokens,
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
