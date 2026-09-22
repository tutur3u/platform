import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

/// Runs the canonical Meet client with an independent, short-lived handoff.
/// Never shares the mobile refresh token, injects JavaScript credentials, or
/// places credentials in navigation URLs.
class MeetPortalPage extends StatelessWidget {
  const MeetPortalPage({super.key});

  @override
  Widget build(BuildContext context) {
    final userId = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (userId == null || workspaceId == null) return const SizedBox.shrink();
    final code = GoRouterState.of(context).uri.queryParameters['room'];
    return _MeetPortal(
      key: ValueKey((userId, workspaceId, code)),
      userId: userId,
      path: code != null && RegExp(r'^[a-z0-9-]{6,80}$').hasMatch(code)
          ? '/r/$code'
          : '/$workspaceId/meetings',
    );
  }
}

class _MeetPortal extends StatefulWidget {
  const _MeetPortal({required this.userId, required this.path, super.key});
  final String userId;
  final String path;
  @override
  State<_MeetPortal> createState() => _MeetPortalState();
}

class _MeetPortalState extends State<_MeetPortal> {
  static final Uri _origin = Uri.parse('https://meet.tuturuuu.com');
  URLRequest? _request;
  bool _failed = false;
  bool _connecting = true;
  bool _exchanged = false;
  bool _inRoom = false;
  int _attempt = 0;
  Timer? _connectionTimeout;

  @override
  void initState() {
    super.initState();
    unawaited(_connect());
  }

  Future<void> _connect() async {
    final attempt = ++_attempt;
    _connectionTimeout?.cancel();
    _connectionTimeout = Timer(const Duration(seconds: 30), () {
      if (mounted && attempt == _attempt && _connecting) {
        setState(() => _failed = true);
      }
    });
    setState(() {
      _failed = false;
      _connecting = true;
      _exchanged = false;
      _inRoom = false;
      _request = null;
    });
    try {
      final client = Supabase.instance.client;
      final identity = await client.auth.getUser();
      if (identity.user?.id != widget.userId) {
        throw StateError('Account changed');
      }
      final token = await client.rpc<Object?>(
        'generate_cross_app_token',
        params: {
          'p_user_id': widget.userId,
          'p_origin_app': 'mobile',
          'p_target_app': 'meet',
          'p_expiry_seconds': 60,
          'p_session_data': {'email': identity.user?.email},
        },
      );
      if (!mounted || attempt != _attempt || _failed) return;
      if (token is! String || token.isEmpty) {
        throw StateError('Handoff unavailable');
      }
      setState(
        () => _request = URLRequest(
          url: WebUri.uri(_origin.resolve('/api/auth/verify-app-token')),
          method: 'POST',
          headers: const {'Content-Type': 'application/json'},
          body: Uint8List.fromList(utf8.encode(jsonEncode({'token': token}))),
        ),
      );
    } on Object catch (error) {
      if (kDebugMode) {
        final code = switch (error) {
          PostgrestException() => error.code,
          AuthException() => error.statusCode,
          _ => error.runtimeType.toString(),
        };
        debugPrint('Meet handoff failed: $code');
      }
      if (mounted && attempt == _attempt) setState(() => _failed = true);
    }
  }

  bool _trusted(Uri uri) =>
      uri.scheme == 'https' && uri.host == _origin.host && uri.port == 443;

  Future<PermissionResponse> _permission(PermissionRequest request) async {
    final attempt = _attempt;
    var allowed =
        _trusted(Uri.parse(request.origin.toString())) &&
        !_failed &&
        _exchanged;
    for (final resource in request.resources) {
      if (!allowed) break;
      if (resource == PermissionResourceType.MICROPHONE) {
        allowed = await Permission.microphone.request().isGranted;
      } else if (resource == PermissionResourceType.CAMERA) {
        allowed = await Permission.camera.request().isGranted;
      } else if (resource == PermissionResourceType.CAMERA_AND_MICROPHONE) {
        allowed =
            await Permission.camera.request().isGranted &&
            await Permission.microphone.request().isGranted;
      } else {
        allowed = false;
      }
    }
    return PermissionResponse(
      resources: request.resources,
      action: allowed && mounted && attempt == _attempt && !_failed
          ? PermissionResponseAction.GRANT
          : PermissionResponseAction.DENY,
    );
  }

  @override
  void dispose() {
    _attempt++;
    _connectionTimeout?.cancel();
    // Disposing the WebView ends its media tracks and ephemeral session.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final request = _request;
    final attempt = _attempt;
    if (_failed) {
      return Center(
        child: TextButton.icon(
          onPressed: _connect,
          icon: const Icon(Icons.refresh),
          label: Text(context.l10n.commonRetry),
        ),
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellChromeActions(
          ownerId: 'meet-room',
          locations: {GoRouterState.of(context).matchedLocation},
          actions: const [],
          immersive: _inRoom,
        ),
        if (request != null)
          InAppWebView(
            key: ValueKey(_attempt),
            initialUrlRequest: request,
            initialSettings: InAppWebViewSettings(
              incognito: true,
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserGesture: false,
              useShouldOverrideUrlLoading: true,
            ),
            onUpdateVisitedHistory: (_, url, _) {
              if (!mounted || attempt != _attempt || url == null) return;
              final inRoom =
                  _trusted(Uri.parse(url.toString())) &&
                  url.path.startsWith('/r/');
              if (_inRoom != inRoom) setState(() => _inRoom = inRoom);
            },
            onPermissionRequest: (_, permission) => attempt == _attempt
                ? _permission(permission)
                : Future.value(
                    PermissionResponse(resources: permission.resources),
                  ),
            shouldOverrideUrlLoading: (_, action) async {
              if (attempt != _attempt || !mounted || _failed) {
                return NavigationActionPolicy.CANCEL;
              }
              final url = action.request.url;
              if (url == null) return NavigationActionPolicy.CANCEL;
              final uri = Uri.parse(url.toString());
              if (_trusted(uri)) return NavigationActionPolicy.ALLOW;
              if (action.isForMainFrame &&
                  ['https', 'mailto'].contains(uri.scheme)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
              return NavigationActionPolicy.CANCEL;
            },
            onReceivedHttpError: (_, request, response) {
              if (request.isForMainFrame == true &&
                  mounted &&
                  attempt == _attempt) {
                if (kDebugMode) {
                  debugPrint('Meet handoff HTTP: ${response.statusCode}');
                }
                setState(() => _failed = true);
              }
            },
            onReceivedError: (_, request, error) {
              if (kDebugMode && request.isForMainFrame == true) {
                debugPrint('Meet handoff navigation: ${error.type}');
              }
              if (request.isForMainFrame == true &&
                  mounted &&
                  attempt == _attempt) {
                setState(() => _failed = true);
              }
            },
            onLoadStop: (controller, url) async {
              if (!mounted || attempt != _attempt || _failed || url == null) {
                return;
              }
              if (!_exchanged && url.path == '/api/auth/verify-app-token') {
                _exchanged = true;
                await controller.loadUrl(
                  urlRequest: URLRequest(
                    url: WebUri.uri(_origin.resolve(widget.path)),
                  ),
                );
              } else if (_exchanged && _trusted(Uri.parse(url.toString()))) {
                _connectionTimeout?.cancel();
                setState(() => _connecting = false);
              }
            },
          ),
        if (_connecting)
          ColoredBox(
            color: shad.Theme.of(context).colorScheme.background,
            child: const Center(child: NovaLoadingIndicator(size: 32)),
          ),
      ],
    );
  }
}
