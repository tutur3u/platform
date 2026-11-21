import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/projects/data/projects_id_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('keeps ids under the named account and clears that one', () async {
    const store = PrefsProjectsIdStore();
    await store.write(
      'a',
      const ProjectsIds(
        machineId: 'm4',
        environmentIds: ['env_1'],
        projectIds: ['p'],
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    // Ids only: no titles or labels are stored.
    expect(
      prefs.getString('mastermind.projects.ids.a'),
      '{"machineId":"m4","environmentIds":["env_1"],"projectIds":["p"]}',
    );
    expect(await store.read('b'), isNull);
    await store.clear('a');
    expect(await store.read('a'), isNull);
    // Signed out: nothing is read or written.
    await store.write('', const ProjectsIds(machineId: 'm4'));
    expect(prefs.getKeys(), isEmpty);
  });

  test('a project moves to the front and the list is capped', () {
    var ids = const ProjectsIds(machineId: 'm4');
    for (var i = 0; i < ProjectsIds.maxProjects + 5; i++) {
      ids = ids.withProject('p$i');
    }
    ids = ids.withProject('p10');
    expect(ids.projectIds, hasLength(ProjectsIds.maxProjects));
    expect(ids.projectIds.first, 'p10');
  });
}
