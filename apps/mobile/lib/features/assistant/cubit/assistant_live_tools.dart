part of 'assistant_live_cubit.dart';

extension _AssistantLiveTools on AssistantLiveCubit {
  Future<void> _executeToolCalls(List<AssistantLiveFunctionCall> calls) {
    final wsId = state.workspaceId;
    if (wsId == null || calls.isEmpty || _isStale(_requestVersion)) {
      return Future<void>.value();
    }
    _ensureActiveTurn();
    final requestVersion = _requestVersion;
    final actorId = _sessionUserId;
    final turnParts = _turnParts;
    // Register at receipt time so streamed text keeps its position while the
    // server is executing. Separate batches run in provider receipt order.
    final parts = [
      for (final call in calls)
        turnParts.beginTool(id: call.id, name: call.name, args: call.args),
    ];
    _emitMicrophoneState(state.copyWith(assistantParts: turnParts.parts));
    final execution = _pendingTools.then((_) async {
      final responses = <Map<String, dynamic>>[];
      final nextCards = [...state.insightCards];
      for (var index = 0; index < calls.length; index++) {
        if (_isStale(requestVersion)) return;
        final call = calls[index];
        Map<String, dynamic> result;
        if (!identical(_turnParts, turnParts)) {
          result = {'error': 'live_tool_cancelled'};
        } else {
          try {
            Future<Map<String, dynamic>> execute() async =>
                call.name == 'get_mobile_screen_context'
                ? screenContextProvider?.call() ?? {'screen': 'unavailable'}
                : await _repository.executeToolCall(
                    wsId: wsId,
                    functionName: call.name,
                    args: call.args,
                  );
            result = actorId == null
                ? await execute()
                : await ApiClient.runForUser(actorId, execute);
          } on ApiException catch (error) {
            result = {'error': error.message};
          } on Object {
            result = {'error': 'live_tool_execution_failed'};
          }
        }
        if (_isStale(requestVersion)) return;
        turnParts.completeTool(parts[index], result);
        responses.add({
          'id': call.id,
          'name': call.name,
          'response': {'result': result},
        });
        final card = result.containsKey('error')
            ? null
            : _buildInsightCard(call, result);
        if (card != null) nextCards.insert(0, card);
      }
      if (_isStale(requestVersion) || !identical(_turnParts, turnParts)) return;
      _emitMicrophoneState(
        state.copyWith(
          assistantParts: turnParts.parts,
          insightCards: nextCards.take(4).toList(growable: false),
        ),
      );
      _socket.sendToolResponses(responses);
    });
    // The dispatcher reports the current failure; future sessions/batches must
    // not inherit a rejected queue. Captured completion still awaits its job.
    _pendingTools = execution.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return execution;
  }
}
