import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html;
import 'package:markdown/markdown.dart' as md;

/// A display adapter only. Provider/editor source bytes remain unchanged.
String calendarDescriptionMarkdown(String source) {
  if (!RegExp(r'</?[a-zA-Z][\w-]*(?:\s[^>]*|/?)>').hasMatch(source)) {
    return source;
  }
  final code = <String>[];
  var suffix = 0;
  var marker = '\uE000calendar-code';
  while (source.contains(marker)) {
    marker = '\uE000calendar-code${suffix++}';
  }
  final protected = _protectCode(source, (literal) {
    final token = '$marker${code.length}\uE001';
    code.add(literal);
    return token;
  });
  var rendered = html
      .parseFragment(protected)
      .nodes
      .map(_markdownNode)
      .join()
      .trim();
  for (var index = 0; index < code.length; index++) {
    rendered = rendered.replaceAll('$marker$index\uE001', code[index]);
  }
  return rendered;
}

// Keep original Markdown code syntax opaque to HTML parsing. This adapter must
// not parse ordinary Markdown and then reinterpret its already-decoded text.
String _protectCode(String source, String Function(String) protect) {
  final output = StringBuffer();
  var cursor = 0;
  while (cursor < source.length) {
    final char = source[cursor];
    if (char != '`' && char != '~') {
      output.write(char);
      cursor++;
      continue;
    }
    var slashCount = 0;
    for (var index = cursor - 1; index >= 0 && source[index] == r'\'; index--) {
      slashCount++;
    }
    var end = cursor;
    while (end < source.length && source[end] == char) {
      end++;
    }
    final fence = source.substring(cursor, end);
    final lineStart = cursor == 0
        ? 0
        : source.lastIndexOf('\n', cursor - 1) + 1;
    final prefix = source.substring(lineStart, cursor);
    final block =
        fence.length >= 3 &&
        RegExp(
          r'^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)])[ \t]+)?[ \t]*$',
        ).hasMatch(prefix);
    if (slashCount.isOdd || (char == '~' && !block)) {
      output.write(fence);
      cursor = end;
      continue;
    }
    final closing = block
        ? RegExp(
            '^[ \t]*(?:>[ \t]*)*'
            '${RegExp.escape(char)}{${fence.length},}[ \t]*\$',
            multiLine: true,
          )
        : RegExp('(?<!`)${RegExp.escape(fence)}(?!`)');
    final match = closing.firstMatch(source.substring(end));
    if (match == null && !block) {
      output.write(fence);
      cursor = end;
      continue;
    }
    final finish = match == null ? source.length : end + match.end;
    output.write(protect(source.substring(cursor, finish)));
    cursor = finish;
  }
  return output.toString();
}

const _discard = {
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'input',
  'button',
  'textarea',
  'select',
  'template',
  'svg',
  'math',
};

Uri? calendarDescriptionLink(String href) {
  final uri = Uri.tryParse(href.trim());
  if (uri == null) return null;
  final scheme = uri.scheme.toLowerCase();
  if (!{'https', 'http', 'mailto', 'tel', 'sms'}.contains(scheme)) return null;
  if ((scheme == 'https' || scheme == 'http') &&
      (uri.host.isEmpty || uri.userInfo.isNotEmpty)) {
    return null;
  }
  return uri;
}

String _markdownNode(dom.Node node) {
  if (node is dom.Text) {
    return node.data.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  }
  if (node is! dom.Element || _discard.contains(node.localName)) return '';
  final body = node.nodes.map(_markdownNode).join();
  switch (node.localName) {
    case 'p':
    case 'div':
    case 'section':
      return '\n\n${body.trim()}\n\n';
    case 'br':
      return '  \n';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      final level = int.parse(node.localName!.substring(1));
      return '\n\n${'#' * level} ${body.trim()}\n\n';
    case 'strong':
    case 'b':
      return '**$body**';
    case 'em':
    case 'i':
      return '*$body*';
    case 'del':
    case 's':
      return '~~$body~~';
    case 'a':
      final link = calendarDescriptionLink(node.attributes['href'] ?? '');
      if (link == null) return body;
      final label = body.replaceAll('[', r'\[').replaceAll(']', r'\]');
      final href = link
          .toString()
          .replaceAll('(', '%28')
          .replaceAll(')', '%29');
      return '[$label](<$href>)';
    case 'img':
      return node.attributes['alt'] ?? '';
    case 'ul':
    case 'ol':
      var index = int.tryParse(node.attributes['start'] ?? '') ?? 1;
      final items = node.children.where((child) => child.localName == 'li').map(
        (item) {
          final content = item.nodes.map(_markdownNode).join().trim();
          final marker = node.localName == 'ol' ? '${index++}.' : '-';
          return '$marker ${content.replaceAll('\n', '\n    ')}';
        },
      );
      return '\n\n${items.join('\n')}\n\n';
    case 'blockquote':
      final lines = body.trim().split('\n').map((line) => '> $line').join('\n');
      return '\n\n$lines\n\n';
    case 'pre':
      final text = node.text;
      var width = 3;
      while (text.contains('`' * width)) {
        width++;
      }
      final fence = '`' * width;
      return '\n\n$fence\n$text\n$fence\n\n';
    case 'code':
      var width = 1;
      while (node.text.contains('`' * width)) {
        width++;
      }
      final fence = '`' * width;
      return '$fence ${node.text} $fence';
    case 'hr':
      return '\n\n---\n\n';
    default:
      return body;
  }
}

String calendarDescriptionPreview(String source) {
  final rendered = md.markdownToHtml(
    calendarDescriptionMarkdown(source),
    extensionSet: md.ExtensionSet.gitHubFlavored,
  );
  String text(dom.Node node) {
    if (node is dom.Text) return node.data;
    if (node is! dom.Element || _discard.contains(node.localName)) return '';
    if (node.localName == 'br') return '\n';
    if (node.localName == 'img') return node.attributes['alt'] ?? '';
    final value = node.nodes.map(text).join();
    return {
          'p',
          'div',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'pre',
        }.contains(node.localName)
        ? '$value\n'
        : value;
  }

  return html
      .parseFragment(rendered)
      .nodes
      .map(text)
      .join()
      .replaceAll(RegExp(r'\n{2,}'), '\n')
      .trim();
}
