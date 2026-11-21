import 'package:web_socket_channel/web_socket_channel.dart';

WebSocketChannel connectFleetOwnerSocket(Uri target, List<String> protocols) =>
    WebSocketChannel.connect(target, protocols: protocols);
