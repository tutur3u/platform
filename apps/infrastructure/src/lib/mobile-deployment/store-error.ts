export class MobileDeploymentStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'mobile_deployment_error'
  ) {
    super(message);
    this.name = 'MobileDeploymentStoreError';
  }
}
