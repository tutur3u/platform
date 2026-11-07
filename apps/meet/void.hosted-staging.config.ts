import { defineConfig } from 'void/config';
import {
  hostedStagingProfile,
  stagingBuildInputs,
} from '../../scripts/wave1-staging/profiles';

export default function hostedStaging() {
  return defineConfig(
    hostedStagingProfile('meet', stagingBuildInputs(process.env, 'meet'))
  );
}
