import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';

/// The Projects tab. It keeps the Work tab's path so existing links and deep
/// links open it; `?state=` preselects a state chip.
String projectsLocation({ProjectThreadState? state}) => state == null
    ? Routes.mastermindWork
    : '${Routes.mastermindWork}?state=${state.name}';

ProjectThreadState? projectsStateFromQuery(String? raw) =>
    ProjectThreadState.values.where((s) => s.name == raw).firstOrNull;

const projectThreadRoute = '${Routes.mastermindWork}/thread/:threadId';

/// A pushed thread. The machine travels in the query so a deep link reopens
/// the same thread on the same machine.
String projectThreadLocation({
  required ProjectsMachine machine,
  required String threadId,
}) => Uri(
  path: '${Routes.mastermindWork}/thread/${Uri.encodeComponent(threadId)}',
  queryParameters: {
    'label': machine.label,
    'env': ?machine.environmentId,
    'machine': machine.machineId,
  },
).toString();

ProjectsMachine projectsMachineFromQuery(Map<String, String> query) =>
    ProjectsMachine(
      label: query['label'] ?? '',
      reachable: true,
      environmentId: _nonEmpty(query['env']),
      machineId: query['machine'] ?? '',
    );

String? _nonEmpty(String? value) =>
    value == null || value.isEmpty ? null : value;
