import 'package:mobile/features/mastermind/projects/data/projects_models.dart';

/// What the Projects screen last read this app session for one account:
/// the machine list and each machine's project headers. A cold open while
/// the bridge machine is offline uses them to find the device's cached
/// lists. Another account reads nothing and its first write starts over.
class ProjectsMemory {
  ProjectsMemory._();

  static final shared = ProjectsMemory._();

  String? _owner;
  List<ProjectsMachine>? _machines;
  final _overviews = <String, ProjectsOverview>{};

  List<ProjectsMachine>? machinesFor(String? account) =>
      account == _owner ? _machines : null;

  ProjectsOverview? overviewOf(String? account, ProjectsMachine machine) =>
      account == _owner ? _overviews[machine.key] : null;

  void rememberMachines(String? account, List<ProjectsMachine> machines) {
    _own(account);
    _machines = machines;
  }

  void rememberOverview(
    String? account,
    ProjectsMachine machine,
    ProjectsOverview overview,
  ) {
    _own(account);
    _overviews[machine.key] = overview;
  }

  void _own(String? account) {
    if (account != _owner) clear();
    _owner = account;
  }

  void clear() {
    _owner = null;
    _machines = null;
    _overviews.clear();
  }
}
