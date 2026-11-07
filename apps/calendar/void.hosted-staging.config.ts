import { defineConfig } from 'void/config';
import {
  hostedStagingProfile,
  stagingBuildInputs,
} from '../../scripts/wave1-staging/profiles';

export default function hostedStaging() {
  return defineConfig(
    hostedStagingProfile(
      'calendar',
      stagingBuildInputs(process.env, 'calendar')
    )
  );
}
