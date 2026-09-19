import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html;

/// The isolated reader counterpart of apps/mail/lib/mail/html.ts.
/// Styles are retained only here, behind the reader's CSP and disabled scripts.
/// Never use this output for compose/signature HTML or an authenticated WebView.
String sanitizeIsolatedMailHtml(
  String source, {
  Map<String, String> inlineImages = const {},
}) {
  final document = html.parse(source);
  final output = dom.DocumentFragment();
  for (final node in [...?document.head?.nodes, ...?document.body?.nodes]) {
    output.nodes.addAll(_sanitizeNode(node, inlineImages));
  }
  return output.outerHtml;
}

const _allowedTags = {
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hgroup',
  'main',
  'nav',
  'section',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'ul',
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'img',
  'font',
  'center',
  'style',
};

const _discardContent = {
  'script',
  'textarea',
  'option',
  'title',
  'iframe',
  'object',
  'embed',
};

const _globalAttributes = {
  'class',
  'style',
  'title',
  'dir',
  'lang',
  'align',
  'bgcolor',
  'id',
};

const _tagAttributes = {
  'blockquote': {'type'},
  'a': {'href', 'name'},
  'img': {'src', 'alt', 'width', 'height'},
  'font': {'color', 'face', 'size'},
  'table': {'width', 'height', 'cellpadding', 'cellspacing', 'border'},
  'td': {'colspan', 'rowspan', 'width', 'height', 'valign'},
  'th': {'colspan', 'rowspan', 'width', 'height', 'valign'},
};

Iterable<dom.Node> _sanitizeNode(
  dom.Node node,
  Map<String, String> inlineImages,
) sync* {
  if (node is dom.Text) {
    yield dom.Text(node.data);
    return;
  }
  if (node is! dom.Element) return;
  final tag = node.localName?.toLowerCase();
  if (_discardContent.contains(tag)) return;
  if (!_allowedTags.contains(tag)) {
    for (final child in node.nodes) {
      yield* _sanitizeNode(child, inlineImages);
    }
    return;
  }
  final clean = dom.Element.tag(tag);
  for (final attribute in node.attributes.entries) {
    if (attribute.key is! String) continue;
    final name = (attribute.key as String).toLowerCase();
    if (!_globalAttributes.contains(name) &&
        !(_tagAttributes[tag]?.contains(name) ?? false)) {
      continue;
    }
    var value = attribute.value;
    if (name == 'src') {
      if (value.startsWith('cid:')) {
        final cid = value.substring(4).replaceAll(RegExp(r'^<|>$'), '');
        final replacement = inlineImages[cid];
        if (replacement != null && _isInlineImage(replacement)) {
          value = replacement;
        } else {
          // Keep the placeholder until authenticated attachment bytes arrive.
          value = 'cid:$cid';
        }
      } else if (!_isAllowedUrl(value, image: true)) {
        continue;
      }
    } else if (name == 'href' && !_isAllowedUrl(value, image: false)) {
      continue;
    }
    clean.attributes[name] = value;
  }
  if (tag == 'a') {
    clean.attributes.addAll({'target': '_self', 'rel': 'noopener noreferrer'});
  }
  for (final child in node.nodes) {
    clean.nodes.addAll(_sanitizeNode(child, inlineImages));
  }
  yield clean;
}

bool _isAllowedUrl(String value, {required bool image}) {
  final normalized = value.replaceAll(RegExp(r'[\x00-\x20\x7f]'), '');
  if (!image && normalized.startsWith('#')) return true;
  final uri = Uri.tryParse(normalized);
  if (uri == null || !uri.hasScheme) return false;
  return (image
          ? const {'https', 'http'}
          : const {'https', 'http', 'mailto', 'tel'})
      .contains(uri.scheme.toLowerCase());
}

bool _isInlineImage(String value) => RegExp(
  r'^data:image/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$',
  caseSensitive: false,
).hasMatch(value);
