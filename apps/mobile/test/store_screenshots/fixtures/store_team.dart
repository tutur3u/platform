import '../store_screenshot_app.dart';

/// The synthetic design team every store screen shows: a five-person studio
/// planning one product launch week. Names and addresses are fictional.
abstract final class StoreTeam {
  static const workspaceId = 'store-ws-studio';

  /// The studio under a per-locale id, for pages whose app cache keys carry
  /// the workspace but not the listing locale.
  static String localeWorkspaceId(StoreLocale l) => '$workspaceId-${l.name}';
  static const workspaceName = 'Sorbet Studio';

  static const me = StorePerson(
    'store-user-linh',
    'Linh Tran',
    'linh@example.com',
  );
  static const minh = StorePerson(
    'store-user-minh',
    'Minh Pham',
    'minh@example.com',
  );
  static const an = StorePerson('store-user-an', 'An Nguyen', 'an@example.com');
  static const bao = StorePerson('store-user-bao', 'Bao Le', 'bao@example.com');
  static const chi = StorePerson('store-user-chi', 'Chi Vo', 'chi@example.com');

  static const List<StorePerson> members = [me, minh, an, bao, chi];

  /// The project the week revolves around.
  static String project(StoreLocale l) =>
      l.pick('Spring launch', 'Ra mắt mùa xuân');

  /// Today at [hour]:[minute] local time, shifted by [days].
  static DateTime at(int hour, [int minute = 0, int days = 0]) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + days, hour, minute);
  }
}

class StorePerson {
  const StorePerson(this.id, this.name, this.email);

  final String id;
  final String name;
  final String email;

  String get firstName => name.split(' ').first;
}
