import 'package:http/http.dart' as http;
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:url_launcher/url_launcher.dart';

final RegExp _shareUrl = RegExp(r'^/api/v1/workspaces/[^/?]+/storage/share\?');

/// Whether [url] is a workspace file link the web stores: a relative
/// sign-on-read URL that needs the signed-in session to open.
bool isDocumentStorageShareUrl(String url) => _shareUrl.hasMatch(url);

/// Opens a document link. A workspace file link is resolved with the
/// session first (its route answers with a short-lived signed URL), since
/// the browser it opens in is not signed in. The session goes only to the
/// app's own origin.
Future<void> openDocumentLink(String url, {http.Client? client}) async {
  var target = url;
  if (isDocumentStorageShareUrl(url)) {
    final resolved = resolveTaskDescriptionUrl(url);
    target = resolved;
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
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
