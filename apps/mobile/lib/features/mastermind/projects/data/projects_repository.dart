import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/http_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

/// Why a Projects read or reply failed, as a closed category; never server
/// text.
enum ProjectsFailureKind {
  /// 503 `machine_offline`: the last list stays on screen with its time.
  machineOffline,

  /// 504: the machine did not answer in time.
  timeout,

  /// 404 (`unknown_thread`): the thread or machine is gone.
  notFound,

  /// 401 `mfa_required`: replies need a fresh MFA check on this device.
  mfaRequired,

  /// 403: this account is not the fleet owner.
  forbidden,

  /// 429.
  rateLimited,

  /// 422 `unsupported_for_linked_machine`. The view never sends a project
  /// read to a linked machine, so this only surfaces a contract drift.
  unsupportedForLinkedMachine,

  /// 422 `invalid_query`: Web refused the search or paging values.
  invalid,

  /// Network failure, other 4xx/5xx or an unreadable body.
  unavailable,
}

/// Web refuses a search longer than this with 422 `invalid_query`.
const maxProjectsSearchLength = 100;

/// The search as Web accepts it: trimmed and at most
/// [maxProjectsSearchLength] characters; null when empty.
String? clipProjectsSearch(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  return trimmed.length <= maxProjectsSearchLength
      ? trimmed
      : trimmed.substring(0, maxProjectsSearchLength).trim();
}

class ProjectsException implements Exception {
  const ProjectsException(this.kind);

  final ProjectsFailureKind kind;

  @override
  String toString() => 'ProjectsException(${kind.name})';
}

/// A thread read up to `itemCount` items, so its unread badge clears in
/// every list holding the row without a refetch.
typedef ThreadSeenMark = ({String machineKey, String threadId, int itemCount});

/// The one data seam of the Projects screen: owner-only reads under
/// `/api/v1/mastermind/fleet/threads` and the fleet replies. Every read is
/// on demand; nothing here polls.
abstract interface class ProjectsRepository {
  /// GET /threads/machines. The first entry is the bridge machine.
  Future<List<ProjectsMachine>> machines();

  /// GET /threads/projects. Bridge machine only. A 404 (route not
  /// deployed) means the screen lists this machine flat.
  Future<ProjectsOverview> projects(ProjectsMachine machine);

  /// GET /threads, newest first: up to 50 rows in the query's scope
  /// (`projectId` and `state` match, `none` meaning no project).
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  );

  /// GET /threads/messages: the newest page first, oldest message first
  /// within it; [before] pages back.
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  });

  /// POST /threads/read. True when Web saved the marker, which is then
  /// announced on [seenMarks]; false leaves every row as it was.
  Future<bool> markRead(
    ProjectsMachine machine, {
    required String threadId,
    required int itemCount,
  });

  Stream<ThreadSeenMark> get seenMarks;

  /// POST /replies under [idempotencyKey]; a retry sends the same key.
  Future<ReplyReceipt> reply(
    ProjectsMachine machine, {
    required String threadId,
    required String text,
    required String idempotencyKey,
  });

  /// GET /replies/{id} after a live receipt hint; null when it is unknown.
  Future<ReplyReceipt?> receipt(ProjectsMachine machine, String replyId);
}

const _fixtureBuild = bool.fromEnvironment('MASTERMIND_FIXTURE');

/// The single place the Projects screen gets its repository. Fixture builds
/// read fixtures; every other build reads Web.
ProjectsRepository Function() createProjectsRepository = () =>
    _fixtureBuild ? FixtureProjectsRepository() : HttpProjectsRepository();

ProjectsRepository? _shared;

/// One repository for the Projects list and its pushed threads, so a thread
/// marked read clears the badge on the list behind it.
ProjectsRepository sharedProjectsRepository() =>
    _shared ??= createProjectsRepository();

/// Drops the shared repository, for tests and account switches.
void resetSharedProjectsRepository() => _shared = null;
