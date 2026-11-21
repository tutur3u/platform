import 'dart:io';

import 'package:web_socket_channel/io.dart';

IOWebSocketChannel connectFleetOwnerSocket(
  Uri target,
  List<String> protocols,
) => IOWebSocketChannel.connect(
  target,
  protocols: protocols,
  customClient: _handshakeClient,
);

final _handshakeClient = _HandshakeClient(HttpClient());

/// Dart's WebSocket sends subprotocols in an HTTP header. Refuse redirects
/// before an HTTP client can forward the single-use ticket to a new origin.
class _HandshakeClient implements HttpClient {
  _HandshakeClient(this._client);

  final HttpClient _client;

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    final request = await _client.openUrl(method, url);
    return request..followRedirects = false;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
