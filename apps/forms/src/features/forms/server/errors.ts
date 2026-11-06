export class FormNotFoundError extends Error {
  constructor() {
    super('Form not found');
    this.name = 'FormNotFoundError';
  }
}
