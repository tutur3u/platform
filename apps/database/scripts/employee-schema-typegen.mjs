import {
  generateEmployeeTypes,
  runEmployeePublicConsumer,
} from './employee-public-consumer-qualification.mjs';

export async function runSchemaTypegen({
  journal,
  personalJournal,
  addressMigration,
  feedback,
  publicConsumer,
  binaryPath,
  metadata,
  receiptDirectory,
  bounded,
  root,
  runSQL,
  beforeGenerate,
}) {
  let generatedTypesSha256 = null;
  let publicConsumerState = null;
  if (
    journal ||
    personalJournal ||
    addressMigration ||
    feedback ||
    publicConsumer
  ) {
    beforeGenerate();
    const generate = () => {
      generatedTypesSha256 = generateEmployeeTypes({
        binaryPath,
        metadata,
        receiptDirectory,
        bounded,
      });
      return generatedTypesSha256;
    };
    if (publicConsumer)
      publicConsumerState = await runEmployeePublicConsumer({
        root,
        metadata,
        receiptDirectory,
        generate,
        runSQL,
      });
    else generate();
  }
  return { generatedTypesSha256, publicConsumerState };
}
