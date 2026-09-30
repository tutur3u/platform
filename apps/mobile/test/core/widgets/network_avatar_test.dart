import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mocktail/mocktail.dart';

class _Client extends Mock implements HttpClient {}

class _Request extends Mock implements HttpClientRequest {}

class _Response extends Stream<List<int>> implements HttpClientResponse {
  final List<int> bytes = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8Dw'
    'HwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  );

  @override
  int get statusCode => HttpStatus.ok;

  @override
  int get contentLength => bytes.length;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(bytes).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ImageRequests {
  final requested = <Uri>[];
  Completer<HttpClientRequest>? pending;

  HttpClient createHttpClient() {
    final client = _Client();
    when(() => client.autoUncompress = any()).thenReturn(true);
    when(() => client.getUrl(any())).thenAnswer((invocation) async {
      final uri = invocation.positionalArguments.single as Uri;
      requested.add(uri);
      if (uri.path == '/pending') return await pending!.future;
      if (uri.path == '/offline') {
        throw const SocketException('Synthetic offline avatar');
      }
      final request = _Request();
      when(request.close).thenAnswer((_) async => _Response());
      return request;
    });
    return client;
  }
}

Widget _avatar(String? url) => MaterialApp(
  home: NetworkAvatar(
    avatarUrl: url,
    radius: 18,
    backgroundColor: Colors.blue,
    child: const Text('AB'),
  ),
);

void _imageTest(
  String description,
  Future<void> Function(WidgetTester tester, _ImageRequests images) body,
) {
  testWidgets(description, (tester) async {
    final previous = debugNetworkImageHttpClientProvider;
    final images = _ImageRequests();
    debugNetworkImageHttpClientProvider = images.createHttpClient;
    try {
      await body(tester, images);
    } finally {
      debugNetworkImageHttpClientProvider = previous;
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.invalid/avatar'));
  });

  for (final url in <String?>[null, '', '   ']) {
    _imageTest('missing or blank URL ($url) uses fallback without a request', (
      tester,
      images,
    ) async {
      await tester.pumpWidget(_avatar(url));
      await tester.pumpAndSettle();
      expect(find.text('AB'), findsOneWidget);
      expect(images.requested, isEmpty);
      final avatar = tester.widget<CircleAvatar>(find.byType(CircleAvatar));
      expect(avatar.foregroundImage, isNull);
      expect(avatar.radius, 18);
      expect(avatar.backgroundColor, Colors.blue);
      expect(tester.takeException(), isNull);
    });
  }

  _imageTest('offline image retains fallback without a framework error', (
    tester,
    images,
  ) async {
    await tester.pumpWidget(_avatar('https://example.invalid/offline'));
    await tester.pumpAndSettle();
    expect(images.requested.single.path, '/offline');
    expect(find.text('AB'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  _imageTest('good image loads and a changed URL recovers from failure', (
    tester,
    images,
  ) async {
    await tester.pumpWidget(_avatar('https://example.invalid/offline'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(_avatar(' https://example.invalid/good '));
    await tester.runAsync(() async {
      final image = tester
          .widget<CircleAvatar>(find.byType(CircleAvatar))
          .foregroundImage!;
      final loaded = Completer<ImageInfo>();
      final listener = ImageStreamListener(
        (info, synchronousCall) => loaded.complete(info),
        onError: loaded.completeError,
      );
      final stream = image.resolve(ImageConfiguration.empty)
        ..addListener(listener);
      final info = await loaded.future;
      expect(info.image.width, 1);
      info.dispose();
      stream.removeListener(listener);
    });
    await tester.pumpAndSettle();
    expect(
      images.requested.map((uri) => uri.path),
      containsAll(['/offline', '/good']),
    );
    expect(tester.takeException(), isNull);
  });

  _imageTest('same URL rebuilds keep the evaluated avatar decoration settled', (
    tester,
    images,
  ) async {
    images.pending = Completer<HttpClientRequest>();
    await tester.pumpWidget(_avatar('https://example.invalid/pending'));
    final avatarFinder = find.byType(NetworkAvatar);
    final animatedFinder = find.descendant(
      of: avatarFinder,
      matching: find.byType(AnimatedContainer),
    );
    final evaluatedFinder = find.descendant(
      of: animatedFinder,
      matching: find.byType(Container),
    );
    final initialImage = tester
        .widget<CircleAvatar>(find.byType(CircleAvatar))
        .foregroundImage!;
    final evaluatedAtTarget = <bool>[];
    final evaluatedImageTypes = <String>[];

    // Continuous parent rebuilds span 256ms, beyond the 200ms avatar
    // transition.
    for (var frame = 0; frame < 16; frame++) {
      await tester.pumpWidget(_avatar(' https://example.invalid/pending '));
      await tester.pump(const Duration(milliseconds: 16));
      final target =
          tester.widget<AnimatedContainer>(animatedFinder).foregroundDecoration!
              as BoxDecoration;
      final evaluated =
          tester.widget<Container>(evaluatedFinder).foregroundDecoration!
              as BoxDecoration;
      evaluatedAtTarget.add(evaluated.image == target.image);
      evaluatedImageTypes.add(evaluated.image.runtimeType.toString());
    }
    images.pending!.completeError(
      const SocketException('Synthetic pending avatar error'),
    );
    await tester.pumpAndSettle();

    expect(
      evaluatedAtTarget,
      everyElement(isTrue),
      reason:
          'Same URL rebuilds restarted foreground decoration transitions; '
          'evaluated types: ${evaluatedImageTypes.toSet()}',
    );
    final rebuiltImage = tester
        .widget<CircleAvatar>(find.byType(CircleAvatar))
        .foregroundImage!;
    expect(rebuiltImage, initialImage);
    expect(rebuiltImage.hashCode, initialImage.hashCode);
    expect(tester.takeException(), isNull);
  });

  _imageTest('failure completing after disposal stays image-local', (
    tester,
    images,
  ) async {
    images.pending = Completer<HttpClientRequest>();
    await tester.pumpWidget(_avatar('https://example.invalid/pending'));
    await tester.pump();
    expect(images.requested.single.path, '/pending');
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    images.pending!.completeError(
      const SocketException('Synthetic late error'),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
