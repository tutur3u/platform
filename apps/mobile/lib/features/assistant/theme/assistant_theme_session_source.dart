import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

/// Observes auth independently of the page while its theme writes drain.
class AssistantThemeSessionSource
    implements ValueListenable<AssistantThemeActor?> {
  AssistantThemeSessionSource({
    required AuthCubit auth,
    required String? actorId,
  }) : _auth = auth,
       _actorId = actorId,
       _authState = auth.state {
    _publish(_authState);
    _subscription = auth.stream.listen(
      _authChanged,
      onDone: () => _actor.value = null,
    );
  }

  final AuthCubit _auth;
  final _actor = ValueNotifier<AssistantThemeActor?>(null);
  late final StreamSubscription<AuthState> _subscription;
  AuthState _authState;
  String? _actorId;
  Future<void>? _closing;
  bool _closed = false;

  @override
  AssistantThemeActor? get value {
    // Cubit.state changes before its asynchronous stream reaches listeners.
    final state = _auth.state;
    final actor = _actor.value;
    return !_auth.isClosed &&
            state.status == AuthStatus.authenticated &&
            actor?.actorId == state.user?.id
        ? actor
        : null;
  }

  void syncActor(String? actorId, {bool force = false}) {
    if (_closing != null) return;
    _actorId = actorId;
    _publish(_auth.state, force: force);
  }

  void _authChanged(AuthState state) {
    if (_closed) return;
    final changed =
        _authState.user?.id != state.user?.id ||
        _authState.status != state.status;
    _authState = state;
    if (changed) _publish(state, force: true);
  }

  void _publish(AuthState state, {bool force = false}) {
    final current =
        state.status == AuthStatus.authenticated && _actorId == state.user?.id
        ? _actorId
        : null;
    if (force || _actor.value?.actorId != current) {
      _actor.value = current == null ? null : AssistantThemeActor(current);
    }
  }

  @override
  void addListener(VoidCallback listener) => _actor.addListener(listener);

  @override
  void removeListener(VoidCallback listener) => _actor.removeListener(listener);

  Future<void> closeAfter(Future<void> writesDrained) =>
      _closing ??= _closeAfter(writesDrained);

  Future<void> _closeAfter(Future<void> writesDrained) async {
    await writesDrained;
    _closed = true;
    await _subscription.cancel();
    _actor.dispose();
  }
}
