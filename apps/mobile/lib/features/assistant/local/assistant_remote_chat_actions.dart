import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

Future<bool> submitAssistantRemoteChat(
  AssistantChatCubit chat,
  AssistantShellState shell, {
  required String wsId,
  required String message,
  required bool Function() isCurrent,
  Future<String> Function()? resolveTimezone,
  bool Function()? isOperationCurrent,
}) async {
  bool admitted() =>
      isCurrent() &&
      !chat.isClosed &&
      chat.state.workspaceId == wsId &&
      chat.state.status != AssistantChatStatus.restoring;
  if (!admitted()) return false;
  final timezone = await (resolveTimezone ?? getCurrentTimezoneIdentifier)();
  if (!admitted()) return false;
  await chat.submit(
    wsId: wsId,
    message: message,
    modelId: shell.selectedModel.value,
    thinkingMode: shell.thinkingMode,
    creditSource: shell.creditSource,
    workspaceContextId: shell.workspaceContextId,
    timezone: timezone,
    isCurrent: isOperationCurrent ?? isCurrent,
    creditWsId: shell.creditSource == AssistantCreditSource.personal
        ? shell.personalWorkspaceId
        : wsId,
  );
  return admitted();
}

Future<void> retryAssistantChat(
  AssistantChatCubit chat,
  AssistantShellState shell, {
  bool Function()? isCurrent,
  Future<String> Function()? resolveTimezone,
  bool Function()? isOperationCurrent,
}) async {
  if (isCurrent != null && !isCurrent()) return;
  final wsId = shell.workspace?.id;
  if (wsId == null || chat.state.workspaceId != wsId) return;
  final timezone = await (resolveTimezone ?? getCurrentTimezoneIdentifier)();
  if ((isCurrent != null && !isCurrent()) ||
      chat.isClosed ||
      chat.state.workspaceId != wsId) {
    return;
  }
  await chat.retryLast(
    wsId: wsId,
    modelId: shell.selectedModel.value,
    thinkingMode: shell.thinkingMode,
    creditSource: shell.creditSource,
    workspaceContextId: shell.workspaceContextId,
    timezone: timezone,
    isCurrent: isOperationCurrent ?? isCurrent,
    creditWsId: shell.creditSource == AssistantCreditSource.personal
        ? shell.personalWorkspaceId
        : wsId,
  );
}
