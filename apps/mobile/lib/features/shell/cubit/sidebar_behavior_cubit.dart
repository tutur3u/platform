import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_preferences.dart';

typedef SidebarBehaviorState = ({
  SidebarBehavior? behavior,
  bool localOverride,
  bool hasAccount,
  bool ready,
});

class SidebarBehaviorCubit extends Cubit<SidebarBehaviorState> {
  SidebarBehaviorCubit({SidebarPreferences? preferences})
    : _preferences = preferences ?? SidebarPreferences(),
      super((
        behavior: null,
        localOverride: false,
        hasAccount: false,
        ready: false,
      ));

  final SidebarPreferences _preferences;
  SidebarDevicePreference _device = (behavior: null, localOverride: false);
  SidebarBehavior? _account;
  String? _userId;
  bool _ready = false;
  int _revision = 0;
  Future<void> _localWrites = Future<void>.value();
  final _uploads = <String, Future<void>>{};

  Future<void> restore(String? userId) async {
    _userId = userId;
    try {
      _device = await _preferences.readDevice();
    } catch (error) {
      debugPrint('Could not read sidebar device preference: $error');
    }
    if (isClosed) return;
    _ready = true;
    _publish();
    final activeUser = _userId;
    if (activeUser != null && !_device.localOverride) {
      await _restoreAccount(activeUser);
    }
  }

  Future<void> bindAccount(String? userId) async {
    if (isClosed || userId == _userId) return;
    _revision++;
    _userId = userId;
    _account = null;
    _publish();
    if (_ready && userId != null && !_device.localOverride) {
      await _restoreAccount(userId);
    }
  }

  Future<void> setBehavior(SidebarBehavior behavior) async {
    if (!_ready || isClosed) return;
    _revision++;
    final userId = _userId;
    if (_device.localOverride || userId == null) {
      _device = (behavior: behavior, localOverride: _device.localOverride);
      final device = _device;
      _publish();
      await _writeLocally(() => _preferences.writeDevice(device));
      return;
    }

    _account = behavior;
    _publish();
    final saved = await _writeLocally(
      () => _preferences.writeAccount(userId, behavior, pending: true),
    );
    if (saved) await _upload(userId);
  }

  Future<void> setLocalOverride({
    required bool value,
    required SidebarBehavior displayed,
  }) async {
    if (!_ready || isClosed || value == _device.localOverride) return;
    _revision++;
    _device = (
      behavior: value ? displayed : _device.behavior,
      localOverride: value,
    );
    final device = _device;
    final revision = _revision;
    _publish();
    await _writeLocally(() => _preferences.writeDevice(device));
    final userId = _userId;
    if (!isClosed && revision == _revision && !value && userId != null) {
      await _restoreAccount(userId);
    }
  }

  void _publish() {
    if (isClosed) return;
    emit((
      behavior: _device.localOverride || _userId == null
          ? _device.behavior
          : _account,
      localOverride: _device.localOverride,
      hasAccount: _userId != null,
      ready: _ready,
    ));
  }

  Future<void> _restoreAccount(String userId) async {
    final revision = _revision;
    bool current() => !isClosed && revision == _revision;
    try {
      await _localWrites;
      final cached = await _preferences.readAccount(userId);
      if (!current()) return;
      _account = cached.behavior;
      _publish();
      if (cached.pending) {
        await _upload(userId);
        return;
      }
      final remote = await _preferences.loadAccount(userId);
      if (!current()) return;
      _account = remote;
      _publish();
      await _writeLocally(
        () => _preferences.writeAccount(userId, remote, pending: false),
      );
    } catch (error) {
      debugPrint('Could not sync sidebar preference: $error');
    }
  }

  Future<bool> _writeLocally(Future<void> Function() write) {
    final result = _localWrites.then((_) async {
      try {
        await write();
        return true;
      } catch (error) {
        debugPrint('Could not store sidebar preference: $error');
        return false;
      }
    });
    _localWrites = result.then<void>((_) {});
    return result;
  }

  Future<void> _upload(String userId) {
    final previous = _uploads[userId] ?? Future<void>.value();
    final send = previous.then((_) async {
      try {
        await _localWrites;
        if (isClosed || _userId != userId || _device.localOverride) return;
        final cached = await _preferences.readAccount(userId);
        final behavior = cached.behavior;
        if (!cached.pending || behavior == null) return;
        if (isClosed || _userId != userId || _device.localOverride) return;
        await _preferences.saveAccount(userId, behavior);
        await _writeLocally(() async {
          final latest = await _preferences.readAccount(userId);
          if (latest == cached) {
            await _preferences.writeAccount(userId, behavior, pending: false);
          }
        });
      } catch (error) {
        // The pending value is retried when this account is bound again.
        debugPrint('Could not upload sidebar preference: $error');
      }
    });
    _uploads[userId] = send;
    return send.whenComplete(() {
      if (identical(_uploads[userId], send)) _uploads.remove(userId);
    });
  }
}
