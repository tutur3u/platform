import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/view/profile_banner.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Client extends Mock implements HttpClient {}

void main() {
  setUpAll(() => registerFallbackValue(Uri.parse('https://example.invalid')));
  testWidgets('empty banner reserves the same 3:1 header geometry', (
    tester,
  ) async {
    await tester.pumpApp(
      const ProfileBanner(profile: UserProfile(id: 'actor')),
    );
    expect(find.byIcon(Icons.panorama_outlined), findsOneWidget);
    expect(tester.widget<AspectRatio>(find.byType(AspectRatio)).aspectRatio, 3);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('pending banner shows loading then a scoped image fallback', (
    tester,
  ) async {
    final pending = Completer<HttpClientRequest>();
    final client = _Client();
    when(() => client.autoUncompress = any()).thenReturn(true);
    when(() => client.getUrl(any())).thenAnswer((_) => pending.future);
    final previous = debugNetworkImageHttpClientProvider;
    debugNetworkImageHttpClientProvider = () => client;
    try {
      await tester.pumpApp(
        const ProfileBanner(
          profile: UserProfile(
            id: 'actor',
            bannerUrl: 'https://example.invalid/banner.png',
          ),
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      pending.completeError(const SocketException('Synthetic image failure'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.panorama_outlined), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      debugNetworkImageHttpClientProvider = previous;
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
}
