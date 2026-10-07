import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Only these native runners register the delivered-inbox channel.
bool deliveredInboxCleanupSupported({
  required bool isWeb,
  required TargetPlatform platform,
}) =>
    !isWeb &&
    (platform == TargetPlatform.android || platform == TargetPlatform.iOS);

/// Opaque lifetime fence, also valid while native cleanup is unavailable.
class DeliveredInboxSession {
  const DeliveredInboxSession._(this.actor, this.boundActor, this.epoch);
  final String actor;
  final String? boundActor;
  final int epoch;
}

class DeliveredInboxSnapshot {
  const DeliveredInboxSnapshot._(
    this.token,
    this.count,
    this.actor,
    this.epoch,
  );
  final String token;
  final int count;
  final String actor;
  final int epoch;
}

/// Delivered-only bridge. A successful bind is required; no pending alarm APIs.
class DeliveredInboxNotifications {
  DeliveredInboxNotifications({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(channelName);

  static const channelName = 'mobile/delivered_inbox_notifications';
  static final instance = DeliveredInboxNotifications();
  final MethodChannel _channel;
  String? _actor;
  int _epoch = 0;
  bool _ready = false;

  bool get supportsCleanup => deliveredInboxCleanupSupported(
    isWeb: kIsWeb,
    platform: defaultTargetPlatform,
  );

  DeliveredInboxSession? captureSession(String actor) {
    if (_actor != null && _actor != actor) return null;
    return DeliveredInboxSession._(actor, _actor, _epoch);
  }

  bool isCurrentSession(DeliveredInboxSession session) =>
      _actor == session.boundActor && _epoch == session.epoch;

  Future<bool> bindSession(String? actor) async {
    final epoch = ++_epoch;
    _actor = actor;
    _ready = false;
    if (!supportsCleanup) return false;
    try {
      final bound = await _channel.invokeMethod<bool>('bindSession', {
        'actor': actor,
      });
      if (_epoch != epoch || _actor != actor) return false;
      return _ready = bound == true;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<DeliveredInboxSnapshot> snapshot({
    required String actor,
    String? workspaceId,
    String? notificationId,
  }) async {
    final epoch = _epoch;
    _requireCurrent(actor, epoch);
    final result = await _channel.invokeMapMethod<String, dynamic>('snapshot', {
      'actor': actor,
      'scope': workspaceId == null ? 'allActor' : 'exactWorkspace',
      'workspaceId': workspaceId,
      'notificationId': notificationId,
    });
    _requireCurrent(actor, epoch);
    final token = result?['token'];
    final count = result?['count'];
    if (token is! String ||
        token.isEmpty ||
        count is! int ||
        count < 0 ||
        count > 512) {
      throw const FormatException('Invalid delivered notification snapshot');
    }
    return DeliveredInboxSnapshot._(token, count, actor, epoch);
  }

  Future<int> dismissSnapshot(DeliveredInboxSnapshot snapshot) async {
    _requireCurrent(snapshot.actor, snapshot.epoch);
    final count = await _channel.invokeMethod<int>('dismissSnapshot', {
      'actor': snapshot.actor,
      'token': snapshot.token,
    });
    _requireCurrent(snapshot.actor, snapshot.epoch);
    if (count == null || count < 0 || count > snapshot.count) {
      throw const FormatException('Invalid delivered notification dismissal');
    }
    return count;
  }

  /// Release a snapshot after a rejected read; does not remove OS items.
  Future<void> discardSnapshot(DeliveredInboxSnapshot snapshot) async {
    _requireCurrent(snapshot.actor, snapshot.epoch);
    final discarded = await _channel.invokeMethod<bool>('discardSnapshot', {
      'actor': snapshot.actor,
      'token': snapshot.token,
    });
    _requireCurrent(snapshot.actor, snapshot.epoch);
    if (discarded != true) {
      throw StateError('Delivered notification snapshot was not released');
    }
  }

  void _requireCurrent(String actor, int epoch) {
    if (!_ready || _actor != actor || _epoch != epoch) {
      throw StateError('Delivered notification session is unavailable');
    }
  }
}
