import 'dart:io' show Platform;

import 'package:mobile/core/config/env.dart';

/// API endpoint constants ported from apps/native/lib/config/api.ts.
class ApiConfig {
  const ApiConfig._();

  /// Base URL with Android emulator localhost rewriting.
  static String get baseUrl {
    var url = Env.apiBaseUrl.replaceAll(RegExp(r'/$'), '');

    // Android emulator maps localhost → 10.0.2.2
    if (Platform.isAndroid && url.contains('localhost')) {
      url = url.replaceAll('localhost', '10.0.2.2');
    }

    return url;
  }
}

/// Auth endpoint paths (called via the mobile auth API on the web backend).
abstract final class AuthEndpoints {
  static const otpSend = '/api/v1/auth/otp/send';
  static const otpVerify = '/api/v1/auth/otp/verify';
  static const passwordLogin = '/api/v1/auth/password-login';
}

/// Profile endpoint paths.
abstract final class ProfileEndpoints {
  static const profile = '/api/v1/users/me/profile';
  static const email = '/api/v1/users/me/email';
  static const fullName = '/api/v1/users/me/full-name';
  static const avatarUploadUrl = '/api/v1/users/me/avatar/upload-url';
  static const avatar = '/api/v1/users/me/avatar';
}

/// Notification endpoint paths.
abstract final class NotificationEndpoints {
  static const base = '/api/v1/notifications';
  static const pushDevices = '$base/push-devices';

  static String notifications(Map<String, String> params) {
    if (params.isEmpty) {
      return base;
    }

    return '$base?${Uri(queryParameters: params).query}';
  }

  static String unreadCount({String? wsId}) {
    if (wsId == null) {
      return '$base/unread-count';
    }

    return '$base/unread-count?${Uri(queryParameters: {'wsId': wsId}).query}';
  }

  static String notification(String notificationId) => '$base/$notificationId';

  static String metadata(String notificationId) =>
      '$base/$notificationId/metadata';

  static String acceptInvite(String wsId) =>
      '/api/workspaces/$wsId/accept-invite';

  static String declineInvite(String wsId) =>
      '/api/workspaces/$wsId/decline-invite';
}

/// Public mobile-specific endpoint paths.
abstract final class MobileEndpoints {
  static const versionCheck = '/api/v1/mobile/version-check';
  static const infrastructureMobileVersions =
      '/api/v1/infrastructure/mobile-versions';
}

/// Workspace endpoint paths.
abstract final class WorkspaceEndpoints {
  static const team = '/api/v1/workspaces/team';
  static String workspace(String wsId) => '/api/workspaces/$wsId';
  static String avatarUploadUrl(String wsId) =>
      '/api/v1/workspaces/$wsId/avatar/upload-url';
  static String avatar(String wsId) => '/api/v1/workspaces/$wsId/avatar';
}

abstract final class WorkspaceSettingsEndpoints {
  static String secrets(String wsId) => '/api/workspaces/$wsId/secrets';

  static String secret(String wsId, String secretId) =>
      '/api/workspaces/$wsId/secrets/$secretId';

  static String storageRolloutState(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/rollout-state';

  static String migrateStorage(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/migrate';

  static String roles(String wsId) => '/api/v1/workspaces/$wsId/roles';

  static String role(String wsId, String roleId) =>
      '/api/v1/workspaces/$wsId/roles/$roleId';

  static String defaultRole(String wsId) =>
      '/api/v1/workspaces/$wsId/roles/default';

  static String roleMembers(String wsId, String roleId) =>
      '/api/v1/workspaces/$wsId/roles/$roleId/members';

  static String roleMember(String wsId, String roleId, String userId) =>
      '/api/v1/workspaces/$wsId/roles/$roleId/members/$userId';

  static String membersEnhanced(String wsId) =>
      '/api/workspaces/$wsId/members/enhanced';

  static String inviteMember(String wsId) =>
      '/api/workspaces/$wsId/members/invite';

  static String members(
    String wsId, {
    String? userId,
    String? email,
  }) {
    final params = <String, String>{};
    if (userId != null && userId.isNotEmpty) {
      params['id'] = userId;
    }
    if (email != null && email.isNotEmpty) {
      params['email'] = email;
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/members$suffix';
  }

  static String inviteLinks(String wsId) =>
      '/api/workspaces/$wsId/invite-links';

  static String inviteLink(String wsId, String linkId) =>
      '/api/workspaces/$wsId/invite-links/$linkId';
}

/// Finance endpoint paths.
abstract final class FinanceEndpoints {
  static String wallets(String wsId) => '/api/workspaces/$wsId/wallets';

  static String transactions(String wsId) =>
      '/api/workspaces/$wsId/transactions';

  static String wallet(String wsId, String walletId) =>
      '/api/workspaces/$wsId/wallets/$walletId';

  static String categories(String wsId) =>
      '/api/workspaces/$wsId/transactions/categories';

  static String category(String wsId, String categoryId) =>
      '/api/workspaces/$wsId/transactions/categories/$categoryId';

  static String tags(String wsId) => '/api/workspaces/$wsId/tags';

  static String tag(String wsId, String tagId) =>
      '/api/workspaces/$wsId/tags/$tagId';

  static String transaction(String wsId, String transactionId) =>
      '/api/workspaces/$wsId/transactions/$transactionId';

  static String transfers(String wsId) => '/api/workspaces/$wsId/transfers';

  /// Cursor-based infinite-scroll endpoint (mirrors web's transactions/infinite).
  static String infiniteTransactions(String wsId) =>
      '/api/workspaces/$wsId/transactions/infinite';

  static String transactionStats(String wsId) =>
      '/api/workspaces/$wsId/transactions/stats';

  static String workspaceConfig(String wsId, String configId) =>
      '/api/v1/workspaces/$wsId/settings/$configId';

  static const exchangeRates = '/api/v1/exchange-rates';
}

/// Inventory endpoint paths.
abstract final class InventoryEndpoints {
  static String access(String wsId) =>
      '/api/v1/workspaces/$wsId/inventory/access';

  static String overview(String wsId) =>
      '/api/v1/workspaces/$wsId/inventory/overview';

  static String products(
    String wsId, {
    String? query,
    String? status,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (status != null && status.trim().isNotEmpty) {
      params['status'] = status.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/inventory/products$suffix';
  }

  static String product(String wsId, String productId) =>
      '/api/v1/workspaces/$wsId/products/$productId';

  static String createProduct(String wsId) =>
      '/api/v1/workspaces/$wsId/products';

  static String productOptions(String wsId) =>
      '/api/v1/workspaces/$wsId/products/options';

  static String owners(String wsId) =>
      '/api/v1/workspaces/$wsId/inventory/owners';

  static String sales(String wsId, {int? limit, int? offset}) {
    final params = <String, String>{};
    if (limit != null) {
      params['limit'] = '$limit';
    }
    if (offset != null) {
      params['offset'] = '$offset';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/inventory/sales$suffix';
  }

  static String sale(String wsId, String saleId) =>
      '/api/v1/workspaces/$wsId/inventory/sales/$saleId';

  static String auditLogs(
    String wsId, {
    int? limit,
    int? offset,
  }) {
    final params = <String, String>{};
    if (limit != null) {
      params['limit'] = '$limit';
    }
    if (offset != null) {
      params['offset'] = '$offset';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/inventory/audit-logs$suffix';
  }

  static String realtime(String wsId) =>
      '/api/v1/workspaces/$wsId/inventory/realtime';

  static String productCategories(String wsId) =>
      '/api/v1/workspaces/$wsId/product-categories';

  static String productUnits(String wsId) =>
      '/api/v1/workspaces/$wsId/product-units';

  static String productWarehouses(String wsId) =>
      '/api/v1/workspaces/$wsId/product-warehouses';

  static String invoices(String wsId) =>
      '/api/v1/workspaces/$wsId/finance/invoices';
}

/// Habits endpoint paths.
abstract final class HabitsEndpoints {
  static String access(String wsId) => '/api/v1/workspaces/$wsId/habits/access';
}

/// Drive endpoint paths.
abstract final class DriveEndpoints {
  static String analytics(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/analytics';

  static String list(
    String wsId, {
    String? path,
    String? search,
    int? limit,
    int? offset,
    String? sortBy,
    String? sortOrder,
  }) {
    final params = <String, String>{};
    if (path != null && path.trim().isNotEmpty) {
      params['path'] = path.trim();
    }
    if (search != null && search.trim().isNotEmpty) {
      params['search'] = search.trim();
    }
    if (limit != null) {
      params['limit'] = '$limit';
    }
    if (offset != null) {
      params['offset'] = '$offset';
    }
    if (sortBy != null && sortBy.isNotEmpty) {
      params['sortBy'] = sortBy;
    }
    if (sortOrder != null && sortOrder.isNotEmpty) {
      params['sortOrder'] = sortOrder;
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/storage/list$suffix';
  }

  static String folders(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/folders';

  static String rename(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/rename';

  static String object(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/object';

  static String share(String wsId) => '/api/v1/workspaces/$wsId/storage/share';

  static String exportLinks(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/export-links';

  static String uploadUrl(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/upload-url';

  static String finalizeUpload(String wsId) =>
      '/api/v1/workspaces/$wsId/storage/finalize-upload';
}

/// CRM / users database endpoint paths.
abstract final class CrmEndpoints {
  static String usersDatabase(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
    List<String>? includedGroups,
    List<String>? excludedGroups,
    String? status,
    String? linkStatus,
    String? requireAttention,
    String? groupMembership,
    bool? withPromotions,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    if (includedGroups != null && includedGroups.isNotEmpty) {
      params['includedGroups'] = includedGroups.join(',');
    }
    if (excludedGroups != null && excludedGroups.isNotEmpty) {
      params['excludedGroups'] = excludedGroups.join(',');
    }
    if (status != null && status.isNotEmpty) {
      params['status'] = status;
    }
    if (linkStatus != null && linkStatus.isNotEmpty) {
      params['linkStatus'] = linkStatus;
    }
    if (requireAttention != null && requireAttention.isNotEmpty) {
      params['requireAttention'] = requireAttention;
    }
    if (groupMembership != null && groupMembership.isNotEmpty) {
      params['groupMembership'] = groupMembership;
    }
    if (withPromotions != null) {
      params['withPromotions'] = withPromotions ? 'true' : 'false';
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/users/database$suffix';
  }

  static String users(String wsId) => '/api/v1/workspaces/$wsId/users';

  static String user(String wsId, String userId) =>
      '/api/v1/workspaces/$wsId/users/$userId';

  static String userGroups(
    String wsId, {
    List<String>? ids,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (ids != null && ids.isNotEmpty) {
      params['ids'] = ids.join(',');
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/users/groups$suffix';
  }

  static String feedbacks(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
    String? requireAttention,
    String? userId,
    String? groupId,
    String? creatorId,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    if (requireAttention != null && requireAttention.isNotEmpty) {
      params['requireAttention'] = requireAttention;
    }
    if (userId != null && userId.isNotEmpty) {
      params['userId'] = userId;
    }
    if (groupId != null && groupId.isNotEmpty) {
      params['groupId'] = groupId;
    }
    if (creatorId != null && creatorId.isNotEmpty) {
      params['creatorId'] = creatorId;
    }

    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/users/feedbacks$suffix';
  }

  static String auditLogs(
    String wsId, {
    required String start,
    required String end,
    String? eventKind,
    String? source,
    String? affectedUserQuery,
    String? actorQuery,
    int? offset,
    int? limit,
  }) {
    final params = <String, String>{
      'start': start,
      'end': end,
    };
    if (eventKind != null && eventKind.isNotEmpty) {
      params['eventKind'] = eventKind;
    }
    if (source != null && source.isNotEmpty) {
      params['source'] = source;
    }
    if (affectedUserQuery != null && affectedUserQuery.trim().isNotEmpty) {
      params['affectedUserQuery'] = affectedUserQuery.trim();
    }
    if (actorQuery != null && actorQuery.trim().isNotEmpty) {
      params['actorQuery'] = actorQuery.trim();
    }
    if (offset != null) {
      params['offset'] = '$offset';
    }
    if (limit != null) {
      params['limit'] = '$limit';
    }

    return '/api/v1/workspaces/$wsId/users/audit-logs?${Uri(queryParameters: params).query}';
  }

  static String detectDuplicates(String wsId) =>
      '/api/v1/workspaces/$wsId/users/duplicates/detect';

  static String mergeUsers(String wsId) =>
      '/api/v1/workspaces/$wsId/users/merge';

  static String bulkImport(String wsId) =>
      '/api/v1/workspaces/$wsId/users/bulk-import';

  static String avatar(String wsId) => '/api/v1/workspaces/$wsId/users/avatar';
}

/// Education endpoint paths.
abstract final class EducationEndpoints {
  static String courses(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/courses$suffix';
  }

  static String course(String wsId, String courseId) =>
      '/api/v1/workspaces/$wsId/courses/$courseId';

  static String quizzes(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/quizzes$suffix';
  }

  static String quiz(String wsId, String quizId) =>
      '/api/v1/workspaces/$wsId/quizzes/$quizId';

  static String quizSets(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/quiz-sets$suffix';
  }

  static String quizSet(String wsId, String setId) =>
      '/api/v1/workspaces/$wsId/quiz-sets/$setId';

  static String flashcards(
    String wsId, {
    String? query,
    int? page,
    int? pageSize,
  }) {
    final params = <String, String>{};
    if (query != null && query.trim().isNotEmpty) {
      params['q'] = query.trim();
    }
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/flashcards$suffix';
  }

  static String flashcard(String wsId, String flashcardId) =>
      '/api/v1/workspaces/$wsId/flashcards/$flashcardId';

  static String attempts(
    String wsId, {
    int? page,
    int? pageSize,
    String? status,
    String? setId,
    String? sortBy,
    String? sortDirection,
  }) {
    final params = <String, String>{};
    if (page != null) {
      params['page'] = '$page';
    }
    if (pageSize != null) {
      params['pageSize'] = '$pageSize';
    }
    if (status != null && status.isNotEmpty) {
      params['status'] = status;
    }
    if (setId != null && setId.isNotEmpty) {
      params['setId'] = setId;
    }
    if (sortBy != null && sortBy.isNotEmpty) {
      params['sortBy'] = sortBy;
    }
    if (sortDirection != null && sortDirection.isNotEmpty) {
      params['sortDirection'] = sortDirection;
    }
    final suffix = params.isEmpty
        ? ''
        : '?${Uri(queryParameters: params).query}';
    return '/api/v1/workspaces/$wsId/education/attempts$suffix';
  }

  static String attempt(String wsId, String attemptId) =>
      '/api/v1/workspaces/$wsId/education/attempts/$attemptId';
}
