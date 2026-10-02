import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/data/meet_collaboration_policy.dart';
import 'package:mobile/features/meet/data/meet_preview_proxy.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shares canonical Yjs editors with web.
/// Rich nodes and selections stay intact.
class MeetCollaborationPage extends StatefulWidget {
  const MeetCollaborationPage({required this.call, super.key, this.apiClient});
  final MeetCallController call;
  final ApiClient? apiClient;
  @override
  State<MeetCollaborationPage> createState() => _MeetCollaborationPageState();
}

class _MeetCollaborationPageState extends State<MeetCollaborationPage> {
  final String _nonce = List.generate(
    32,
    (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  late final ApiClient _api = widget.apiClient ?? ApiClient();
  late final _preview = MeetPreviewProxy(
    meetingId: widget.call.meetingId,
    api: _api,
  );
  late final Future<void> _previewReady = _preview.start();
  InAppWebViewController? _web;
  late Uri _editor;
  bool _failed = false;
  @override
  void initState() {
    super.initState();
    widget.call.addListener(_settingsChanged);
    unawaited(
      _previewReady.catchError((Object _) {
        if (mounted) setState(() => _failed = true);
      }),
    );
  }

  @override
  void dispose() {
    widget.call.removeListener(_settingsChanged);
    unawaited(
      _previewReady.then((_) => _preview.close()).catchError((Object _) {}),
    );
    if (widget.apiClient == null) _api.dispose();
    super.dispose();
  }

  void _settingsChanged() {
    final web = _web;
    if (web == null) return;
    unawaited(
      web
          .evaluateJavascript(
            source:
                'window.dispatchEvent(new CustomEvent( '
                '"tuturuuu:meeting-settings", '
                '{detail:${jsonEncode(widget.call.settings)}}));',
          )
          .catchError((Object _) => null),
    );
  }

  MeetCollaborationPolicy get _policy =>
      MeetCollaborationPolicy(editor: _editor, nonce: _nonce);
  Future<Object?> _request(List<dynamic> args) async {
    final current = await _web?.getUrl();
    final request = _policy.authorize(
      arguments: args,
      currentUrl: current == null ? null : Uri.parse(current.toString()),
      ended: widget.call.ended,
      admission: widget.call.admission,
    );
    final action = request.action;
    final payload = request.payload;
    final path =
        '/api/v1/meetings/${Uri.encodeComponent(widget.call.meetingId)}/collaboration';
    if (action == 'room') {
      await _previewReady;
      return {
        'canManage': widget.call.role == 'host',
        'previewBaseUrl': _preview.baseUrl,
        'programming': widget.call.settings['programming'],
      };
    }
    if (const {'document', 'programming'}.contains(action)) {
      return await _api.getJson('$path?action=$action');
    }
    if (const {'readRun', 'readTest'}.contains(action)) {
      final operation = action == 'readRun' ? 'run' : 'test';
      return await _api.getJson(
        '$path?action=$operation&id=${(payload! as Map)['id']}',
      );
    }
    return await _api.postJson(path, {'action': action, 'payload': payload});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final base = Uri.parse(Env.meetEditorBaseUrl);
    final local =
        kDebugMode &&
        base.scheme == 'http' &&
        const {'localhost', '127.0.0.1'}.contains(base.host);
    if (base.scheme != 'https' && !local) {
      return Scaffold(
        body: Center(child: Text(l10n.meetCollaborationUnavailable)),
      );
    }
    _editor = base.replace(
      path:
          '/${Localizations.localeOf(context).languageCode}/native-collaboration',
      queryParameters: {'meetingId': widget.call.meetingId},
      fragment: _nonce,
    );
    return Scaffold(
      appBar: AppBar(title: Text(l10n.meetCollaboration)),
      body: _failed
          ? Center(child: Text(l10n.meetCollaborationUnavailable))
          : InAppWebView(
              initialUrlRequest: URLRequest(url: WebUri(_editor.toString())),
              initialSettings: InAppWebViewSettings(
                useShouldOverrideUrlLoading: true,
                mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
                allowFileAccess: false,
              ),
              onWebViewCreated: (controller) {
                _web = controller;
                controller.addJavaScriptHandler(
                  handlerName: 'meetCollaboration',
                  callback: _request,
                );
              },
              onLoadStop: (_, _) => _settingsChanged(),
              shouldOverrideUrlLoading: (_, navigation) async {
                final url = navigation.request.url;
                if (url == null) return NavigationActionPolicy.CANCEL;
                if (navigation.isForMainFrame &&
                    !_policy.allowsNavigation(Uri.parse(url.toString()))) {
                  return NavigationActionPolicy.CANCEL;
                }
                return NavigationActionPolicy.ALLOW;
              },
              onReceivedError: (_, request, _) {
                if (request.isForMainFrame == true && mounted) {
                  setState(() => _failed = true);
                }
              },
            ),
    );
  }
}
