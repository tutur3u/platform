import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/education_access_repository.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockEducationAccessRepository extends Mock
    implements EducationAccessRepository {}

void main() {
  group('EducationAccessCubit', () {
    late _MockEducationAccessRepository repository;
    late EducationAccessCubit cubit;

    setUp(() {
      repository = _MockEducationAccessRepository();
      cubit = EducationAccessCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    blocTest<EducationAccessCubit, EducationAccessState>(
      'loads education access for the active workspace',
      build: () {
        when(
          () => repository.isEducationEnabled('team-1'),
        ).thenAnswer((_) async => true);
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        EducationAccessState(
          status: EducationAccessStatus.loading,
          wsId: 'team-1',
        ),
        EducationAccessState(
          status: EducationAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      ],
    );

    blocTest<EducationAccessCubit, EducationAccessState>(
      'clears access when the backend denies the workspace',
      build: () {
        when(
          () => repository.isEducationEnabled('team-1'),
        ).thenThrow(Exception('forbidden'));
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        EducationAccessState(
          status: EducationAccessStatus.loading,
          wsId: 'team-1',
        ),
        EducationAccessState(
          status: EducationAccessStatus.error,
          wsId: 'team-1',
        ),
      ],
    );
  });
}
