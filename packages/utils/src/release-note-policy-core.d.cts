declare const policy: {
  isReleaseBookkeeping(subject: string): boolean;
  filterReleaseBookkeeping(markdown: string): string;
};
export = policy;
