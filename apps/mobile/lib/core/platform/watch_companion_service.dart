import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

typedef WatchOriginPathResolver = String Function(String path);

/// Pushes the active iPhone session, workspace metadata, and resolved API
/// origins to the paired Apple Watch via WatchConnectivity (`mobile/watch_companion`).
///
/// No secrets are embedded in code; only the signed-in user's short-lived
/// Supabase access token is forwarded over encrypted WatchConnectivity and
/// wiped immediately on sign-out.
class WatchCompanionService {
  WatchCompanionService({
    MethodChannel? channel,
    bool? isIOSOverride,
    SupabaseClient? authClient,
    WatchOriginPathResolver? originPathResolver,
  }) : _channel = channel ?? const MethodChannel(_channelName),
       _isIOS = isIOSOverride ?? (!kIsWeb && Platform.isIOS),
       _authClient = authClient,
       _originPathResolver =
           originPathResolver ?? ApiConfig.canonicalBaseUrlForPath;

  static const String _channelName = 'mobile/watch_companion';

  final MethodChannel _channel;
  final bool _isIOS;
  final SupabaseClient? _authClient;
  final WatchOriginPathResolver _originPathResolver;

  Workspace? _workspace;
  String _localeCode = 'en';
  bool _calmColors = false;
  String? _defaultListId;
  bool _attached = false;

  GoTrueClient get _auth => (_authClient ?? supabase).auth;

  /// Registers the reverse MethodChannel handler so the paired Apple Watch can
  /// request a fresh Supabase access token when its cached token expires.
  void attach() {
    if (!_isIOS || _attached) return;
    _attached = true;
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  void dispose() {
    if (!_attached) return;
    _attached = false;
    _channel.setMethodCallHandler(null);
  }

  Future<void> syncAuthenticatedState({
    required Workspace? workspace,
    String? localeCode,
    bool? calmColors,
    String? defaultListId,
    bool forceRefreshToken = false,
  }) async {
    _workspace = workspace;
    if (localeCode != null && localeCode.isNotEmpty) {
      _localeCode = _normalizeLocale(localeCode);
    }
    if (calmColors != null) {
      _calmColors = calmColors;
    }
    if (defaultListId != null) {
      _defaultListId = defaultListId;
    }

    if (!_isIOS) return;

    final payload = await _buildCurrentPayload(
      forceRefreshToken: forceRefreshToken,
    );
    await _pushPayload(payload);
  }

  Future<void> clearSession() async {
    _workspace = null;
    _defaultListId = null;
    if (!_isIOS) return;
    await _pushPayload(const {'signedOut': true});
  }

  Future<Object?> _handleNativeCall(MethodCall call) async {
    if (call.method != 'refreshSession') {
      throw MissingPluginException('Unknown method ${call.method}');
    }
    final payload = await _buildCurrentPayload(forceRefreshToken: true);
    return jsonEncode(payload);
  }

  Future<Map<String, dynamic>> _buildCurrentPayload({
    required bool forceRefreshToken,
  }) async {
    final session = await _resolveSession(forceRefresh: forceRefreshToken);
    final user = session?.user ?? _auth.currentUser;
    final workspace = _workspace;
    final token = session?.accessToken;

    if (user == null ||
        token == null ||
        token.isEmpty ||
        workspace == null ||
        workspace.id.isEmpty) {
      return const {'signedOut': true};
    }

    final origins = _resolveOrigins();
    final firstName = _extractFirstName(user);
    final rawName = workspace.name?.trim();
    final workspaceName = (rawName == null || rawName.isEmpty)
        ? 'Tuturuuu'
        : rawName;

    return <String, dynamic>{
      'signedOut': false,
      'accessToken': token,
      'metadata': <String, dynamic>{
        'userId': user.id,
        if (firstName != null) 'userFirstName': firstName,
        'workspaceId': workspace.id,
        'workspaceName': workspaceName,
        'isPersonal': workspace.personal,
        if (_defaultListId != null && _defaultListId!.isNotEmpty)
          'defaultListId': _defaultListId,
        'apiOrigins': origins,
        'locale': _localeCode,
        'calmColors': _calmColors,
        if (session?.expiresAt != null)
          'expiresAtEpochSeconds': session!.expiresAt!.toDouble(),
      },
    };
  }

  Future<Session?> _resolveSession({required bool forceRefresh}) async {
    final current = _auth.currentSession;
    if (!forceRefresh && current != null && current.accessToken.isNotEmpty) {
      return current;
    }
    try {
      final refreshed = await _auth.refreshSession();
      return refreshed.session ?? current;
    } on Object {
      return current;
    }
  }

  Map<String, String> _resolveOrigins() {
    return <String, String>{
      'platform': _originPathResolver(
        '/api/v1/workspaces/ws/chat/conversations',
      ),
      'tasks': _originPathResolver('/api/v1/users/me/tasks'),
      'calendarBase': _originPathResolver(
        '/api/v1/workspaces/ws/calendar/events',
      ),
    };
  }

  Future<void> _pushPayload(Map<String, dynamic> payload) async {
    try {
      await _channel.invokeMethod<bool>('syncContext', jsonEncode(payload));
    } on MissingPluginException {
      // Non-iOS platforms or test harnesses without native registration.
    } on PlatformException {
      // Watch pairing/reachability errors are non-fatal for the iPhone app.
    }
  }

  static String _normalizeLocale(String raw) =>
      raw.toLowerCase().startsWith('vi') ? 'vi' : 'en';

  static String? _extractFirstName(User user) {
    final meta = user.userMetadata;
    final raw =
        (meta?['display_name'] as String?) ??
        (meta?['full_name'] as String?) ??
        (meta?['name'] as String?);
    if (raw == null) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    return trimmed.split(RegExp(r'\s+')).first;
  }
}
