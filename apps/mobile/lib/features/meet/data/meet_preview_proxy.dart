import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:mobile/data/sources/api_client.dart';

/// Loopback preview capability. Platform session tokens stay in native code.
class MeetPreviewProxy {
  MeetPreviewProxy({required this.meetingId, required this.api});
  final String meetingId;
  final ApiClient api;
  final String _capability = List.generate(
    32,
    (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  HttpServer? _server;
  String get baseUrl =>
      'http://127.0.0.1:${_server!.port}/$_capability/preview/';
  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen((request) => unawaited(_handle(request)));
  }

  Future<void> _handle(HttpRequest request) async {
    try {
      final parts = request.uri.pathSegments;
      if (request.method != 'GET' ||
          parts.length < 3 ||
          parts[0] != _capability ||
          parts[1] != 'preview') {
        request.response.statusCode = 403;
        return;
      }
      final port = int.tryParse(parts[2]);
      if (port == null || port < 1024 || port > 65535) {
        request.response.statusCode = 400;
        return;
      }
      final assets = parts.skip(3);
      if (assets.any(
        (part) =>
            part == '.' ||
            part == '..' ||
            RegExp(r'[\\/%\x00-\x1f]').hasMatch(part),
      )) {
        request.response.statusCode = 400;
        return;
      }
      final suffix = assets.map(Uri.encodeComponent).join('/');
      final query = {
        ...request.uri.queryParameters,
        '__nativePrefix': '$baseUrl$port/',
      };
      final path =
          '/api/v1/meetings/${Uri.encodeComponent(meetingId)}/collaboration/preview/$port/$suffix?${Uri(queryParameters: query).query}';
      final response = await api
          .getStream(path, accept: '*/*', followRedirects: false)
          .timeout(const Duration(seconds: 15));
      request.response.statusCode = response.statusCode;
      for (final key in [
        'content-type',
        'content-security-policy',
        'x-content-type-options',
        'referrer-policy',
      ]) {
        final value = response.headers[key];
        if (value != null) request.response.headers.set(key, value);
      }
      request.response.headers.set('Cache-Control', 'private, no-store');
      request.response.headers.set('Access-Control-Allow-Origin', '*');
      final bytes = BytesBuilder();
      await for (final chunk in response.stream.timeout(
        const Duration(seconds: 15),
      )) {
        if (bytes.length + chunk.length > 600000) {
          throw const FormatException('Preview exceeds limit');
        }
        bytes.add(chunk);
      }
      request.response.add(bytes.takeBytes());
    } on Object {
      request.response.statusCode = 503;
    } finally {
      await request.response.close();
    }
  }

  Future<void> close() async {
    await _server?.close(force: true);
    _server = null;
  }
}
