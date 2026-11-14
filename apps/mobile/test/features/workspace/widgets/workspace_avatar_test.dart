import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Client extends Mock implements HttpClient {}

/// A workspace tile avatar sized by its default 18 radius at 3x device pixel
/// ratio decodes at 108 device px instead of the source resolution.
void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.invalid/avatar'));
  });

  testWidgets('network avatar tile decodes at its displayed size', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetDevicePixelRatio);
    final previous = debugNetworkImageHttpClientProvider;
    final client = _Client();
    when(() => client.getUrl(any())).thenAnswer(
      (_) async => throw const SocketException('Synthetic offline avatar'),
    );
    debugNetworkImageHttpClientProvider = () => client;
    try {
      await tester.pumpThemedHome(
        const Scaffold(
          body: WorkspaceAvatar(
            workspace: Workspace(
              id: 'ws-1',
              name: 'Product',
              avatarUrl: 'https://example.test/avatar.png',
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      final image = tester.widget<Image>(find.byType(Image));
      final provider = image.image;
      expect(provider, isA<ResizeImage>());
      final resized = provider as ResizeImage;
      // radius 18 × 2 × dpr 3 = 108 device px, rounded up.
      expect(resized.width, 108);
      expect(resized.height, isNull);
      expect(resized.imageProvider, isA<NetworkImage>());
      // The offline tile keeps its initials fallback.
      expect(find.text('P'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      debugNetworkImageHttpClientProvider = previous;
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
}
