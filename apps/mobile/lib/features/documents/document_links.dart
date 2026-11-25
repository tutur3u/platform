import 'package:http/http.dart' as http;
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:url_launcher/url_launcher.dart';

/// The relative path every workspace file link the web stores starts with.
/// The editor treats it as a complete link, so it is not given `https://`.
const String documentWorkspaceLinkPrefix = '/api/v1/workspaces/';

final RegExp _shareUrl = RegExp(r'^/api/v1/workspaces/[^/?]+/storage/share\?');

/// Opens a URI outside the app; replaceable in tests.
typedef DocumentLinkLauncher = Future<bool> Function(Uri uri);

Future<bool> _launchExternally(Uri uri) =>
    launchUrl(uri, mode: LaunchMode.externalApplication);

/// [url] as stored, undoing the `https://` an editor adds to a relative
/// link it does not recognise (`https:///api/...`).
String normalizeDocumentLink(String url) {
  final trimmed = url.trim();
  for (final scheme in ['https://', 'http://']) {
    if (trimmed.startsWith('$scheme/')) {
      return trimmed.substring(scheme.length);
    }
  }
  return trimmed;
}

/// Whether [url] is a workspace file link the web stores: a relative
/// sign-on-read URL that needs the signed-in session to open.
bool isDocumentStorageShareUrl(String url) =>
    _shareUrl.hasMatch(normalizeDocumentLink(url));

/// Opens a document link. A workspace file link is resolved with the
/// session first (its route answers with a short-lived signed URL), since
/// the browser it opens in is not signed in. The session goes only to the
/// app's own origin. Returns whether a URI was handed to the launcher.
Future<bool> openDocumentLink(
  String url, {
  http.Client? client,
  DocumentLinkLauncher launch = _launchExternally,
}) async {
  final link = normalizeDocumentLink(url);
  // A relative link belongs to the app's own origin, as on the web.
  var target = link.startsWith('/') ? resolveTaskDescriptionUrl(link) : link;
  if (isDocumentStorageShareUrl(link)) {
    final resolved = target;
    final http_ = client ?? http.Client();
    try {
      final request = http.Request('GET', Uri.parse(resolved))
        ..followRedirects = false
        ..headers.addAll(trustedAuthHeadersForUrl(resolved) ?? const {});
      final response = await http_.send(request);
      final location = response.headers['location'];
      if (location != null && location.isNotEmpty) target = location;
    } on Object {
      // Fall back to opening the route itself.
    } finally {
      if (client == null) http_.close();
    }
  }
  final uri = Uri.tryParse(target);
  if (uri == null || !uri.hasScheme) return false;
  await launch(uri);
  return true;
}
