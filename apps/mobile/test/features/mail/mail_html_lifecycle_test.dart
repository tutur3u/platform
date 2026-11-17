import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_html_body.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

class _Controller extends Mock implements PlatformInAppWebViewController {}

class _Platform extends InAppWebViewPlatform {
  int creates = 0;
  final views = <_View>[];
  @override
  PlatformInAppWebViewWidget createPlatformInAppWebViewWidget(
    PlatformInAppWebViewWidgetCreationParams params,
  ) {
    creates++;
    final view = _View(params);
    views.add(view);
    return view;
  }
}

class _View extends PlatformInAppWebViewWidget {
  _View(super.params) : super.implementation();
  @override
  Widget build(BuildContext context) => const SizedBox.expand();
  @override
  T controllerFromPlatform<T>(PlatformInAppWebViewController controller) =>
      throw UnimplementedError();
  @override
  void dispose() {}
}

Future<void> _settle(WidgetTester tester) async {
  for (var attempt = 0; attempt < 50; attempt++) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    });
    await tester.pump();
    if (find.byType(InAppWebView).evaluate().isNotEmpty) {
      await tester.pumpAndSettle();
      return;
    }
  }
  fail('The current document did not mount its native delegate');
}

void main() {
  late _Platform platform;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    platform = _Platform();
    InAppWebViewPlatform.instance = platform;
  });

  testWidgets('equal inline maps retain native body and height', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final documents = MailRenderedDocuments();
    Widget body(Map<String, String> images) => MailHtmlBody(
      html: '<p>hello</p>',
      inlineImages: images,
      showControls: false,
      renderedDocuments: documents,
    );
    await tester.pumpThemedHome(body({'cat': 'data:image/png;base64,AAAA'}));
    await _settle(tester);
    expect(platform.creates, 1);
    final view = platform.views.single;
    view.params.onContentSizeChanged!(
      InAppWebViewController.fromPlatform(platform: _Controller()),
      const Size(390, 320),
      const Size(390, 640),
    );
    await tester.pump();
    expect(tester.getSize(find.byType(InAppWebView)).height, 640);
    view.params.onContentSizeChanged!(
      InAppWebViewController.fromPlatform(platform: _Controller()),
      const Size(390, 640),
      const Size(390, 320),
    );
    await tester.pump();
    expect(tester.getSize(find.byType(InAppWebView)).height, 640);
    await tester.pumpThemedHome(body({'cat': 'data:image/png;base64,AAAA'}));
    await _settle(tester);
    expect(platform.creates, 1);
    expect(tester.getSize(find.byType(InAppWebView)).height, 640);
    final controller = _Controller();
    when(controller.getContentHeight).thenAnswer((_) async => 900);
    view.params.onWebViewCreated!(
      InAppWebViewController.fromPlatform(platform: controller),
    );
    tester.view.physicalSize = const Size(840, 1200);
    await tester.pumpAndSettle();
    verify(controller.getContentHeight).called(1);
    expect(tester.getSize(find.byType(InAppWebView)).height, 900);
    expect(platform.creates, 1);
    await tester.pumpThemedHome(const SizedBox());
    await tester.pumpThemedHome(body({'cat': 'data:image/png;base64,AAAA'}));
    await _settle(tester);
    expect(tester.getSize(find.byType(InAppWebView)).height, 900);
  });

  testWidgets('equal messages retain inline bytes and tap identity', (
    tester,
  ) async {
    final repository = _Repository();
    final bytes = Uint8List.fromList(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      ),
    );
    when(
      () => repository.attachment(
        'ws',
        'box',
        'm',
        'cat',
        threadId: 'thread',
        cacheInlineImage: true,
      ),
    ).thenAnswer((_) async => bytes);
    Map<String, dynamic> message({String body = '<img src="cid:cat">'}) => {
      'id': 'm',
      'bodyHtml': body,
      'attachments': [
        <String, dynamic>{
          'id': 'cat',
          'contentId': 'cat',
          'contentType': 'image/png',
          'sizeBytes': bytes.length,
          'disposition': 'inline',
        },
      ],
    };
    Widget content(Map<String, dynamic> value, {String workspace = 'ws'}) =>
        MailMessageContent(
          repository: repository,
          workspaceId: workspace,
          mailboxId: 'box',
          threadId: 'thread',
          message: value,
          showControls: false,
        );
    await tester.pumpThemedHome(content(message()));
    await _settle(tester);
    final images = tester
        .widget<MailHtmlBody>(find.byType(MailHtmlBody))
        .inlineImages;
    expect(images, contains('cat'));
    await tester.pumpThemedHome(content(message()));
    await _settle(tester);
    expect(
      identical(
        tester.widget<MailHtmlBody>(find.byType(MailHtmlBody)).inlineImages,
        images,
      ),
      isTrue,
    );
    verify(
      () => repository.attachment(
        'ws',
        'box',
        'm',
        'cat',
        threadId: 'thread',
        cacheInlineImage: true,
      ),
    ).called(1);
    await tester.pumpThemedHome(content(message(body: '<p>changed</p>')));
    await _settle(tester);
    expect(
      tester.widget<MailHtmlBody>(find.byType(MailHtmlBody)).inlineImages,
      isEmpty,
    );
    final pending = Completer<Uint8List>();
    when(
      () => repository.attachment(
        'ws2',
        'box',
        'm',
        'cat',
        threadId: 'thread',
        cacheInlineImage: true,
      ),
    ).thenAnswer((_) => pending.future);
    await tester.pumpThemedHome(content(message(), workspace: 'ws2'));
    expect(
      tester.widget<MailHtmlBody>(find.byType(MailHtmlBody)).inlineImages,
      isEmpty,
    );
    pending.complete(bytes);
    await _settle(tester);
    verify(
      () => repository.attachment(
        'ws2',
        'box',
        'm',
        'cat',
        threadId: 'thread',
        cacheInlineImage: true,
      ),
    ).called(1);
    expect(tester.takeException(), isNull);
  });
}
