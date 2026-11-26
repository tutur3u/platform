import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_display_content.dart';
import 'package:mobile/features/chat/widgets/chat_link_previews.dart';

import '../../helpers/pump_app.dart';
import 'chat_cubit_fixture.dart';

ChatMessage _external(String content, {int n = 1}) => fixtureMessage(
  n,
).copyWith(content: content, metadata: const {'externalChat': true});

void main() {
  group('external chat text', () {
    test('decodes references with or without semicolons, as web', () {
      expect(
        decodeChatCharacterReferences('a &amp b &lt;c&gt; &copy2026 &#38 &foo'),
        'a & b <c> ©2026 & &foo',
      );
      // Up to three passes, then stops.
      expect(decodeChatCharacterReferences('&amp;amp;amp;lt;'), '&lt;');
    });

    test('decoded text is shown literally, with links kept', () {
      final message = _external(
        '&#42;not bold&#42; # no heading see https://a.example/x.',
      );
      final markdown = chatMessageMarkdown(message);
      final rendered = md.markdownToHtml(markdown);

      expect(rendered, isNot(contains('<em>')));
      expect(rendered, isNot(contains('<h1>')));
      expect(rendered, contains('*not bold*'));
      expect(rendered, contains('<a href="https://a.example/x">'));
      expect(rendered, contains('</a>.'));
    });

    test('indentation cannot start a code block', () {
      final rendered = md.markdownToHtml(
        chatMessageMarkdown(_external('    four spaces')),
      );
      expect(rendered, isNot(contains('<code>')));
    });

    test('other messages are left as written', () {
      final message = fixtureMessage(1).copyWith(content: '**bold** &amp;');
      expect(chatMessageMarkdown(message), '**bold** &amp;');
      expect(chatMessageDisplayContent(message), '**bold** &amp;');
    });

    test('decoding is cached per message and content', () {
      final first = _external('x &amp; y', n: 7);
      expect(chatMessageDisplayContent(first), 'x & y');
      expect(
        identical(
          chatMessageDisplayContent(first),
          chatMessageDisplayContent(first),
        ),
        isTrue,
      );
      // An edit under the same id decodes again.
      expect(
        chatMessageDisplayContent(first.copyWith(content: 'x &lt; y')),
        'x < y',
      );
    });
  });

  group('link previews', () {
    test('a link the device cannot normalize disables position pairing', () {
      const preview = ChatLinkPreview(url: 'https://b.example/', title: 'B');
      // One link has no host, so the server may have answered for a
      // different set than position pairing would assume.
      expect(
        pairChatLinkPreviews(
          const ['https://', 'https://b.example'],
          const [preview],
        ),
        {'https://b.example': preview},
      );
    });

    testWidgets('only a web address is opened from a card', (tester) async {
      await tester.pumpApp(
        const Column(
          children: [
            ChatLinkPreviewCard(
              preview: ChatLinkPreview(
                url: 'javascript:alert(1)',
                title: 'Not a page',
              ),
            ),
            ChatLinkPreviewCard(
              preview: ChatLinkPreview(
                url: 'https://docs.example/guide',
                title: 'Guide',
              ),
            ),
          ],
        ),
      );
      final cards = tester.widgetList<AppCard>(find.byType(AppCard)).toList();
      expect(cards.first.onTap, isNull);
      expect(cards.last.onTap, isNotNull);
    });
  });
}
