import { defineConfig } from 'void/config';
import {
  hostedStagingProfile,
  stagingBuildInputs,
} from '../../scripts/wave1-staging/profiles';

export default function hostedStaging() {
  return defineConfig(
    hostedStagingProfile('mail', stagingBuildInputs(process.env, 'mail'))
  );
}
