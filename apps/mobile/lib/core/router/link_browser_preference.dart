import 'package:shared_preferences/shared_preferences.dart';

enum LinkBrowserPreference { builtIn, external }

const _key = 'link-browser-preference';

Future<LinkBrowserPreference> readLinkBrowserPreference() async {
  final saved = (await SharedPreferences.getInstance()).getString(_key);
  return saved == LinkBrowserPreference.external.name
      ? LinkBrowserPreference.external
      : LinkBrowserPreference.builtIn;
}

Future<void> saveLinkBrowserPreference(LinkBrowserPreference preference) async {
  final saved = await (await SharedPreferences.getInstance()).setString(
    _key,
    preference.name,
  );
  if (!saved) throw StateError('Browser preference could not be saved');
}
