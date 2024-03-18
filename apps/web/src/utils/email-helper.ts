export const isEmail = (text: string): boolean => {
  const emailRegex =
    /^(?:[^<>()[\]\\.,;:\s@"]+(?:\.[^<>()[\]\\.,;:\s@"]+)*|".+")@(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}]|(?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,})$/;
  return emailRegex.test(text);
};

export const isIncompleteEmail = (text: string): boolean => {
  // Incomplete email is a string that has a non-leading @ but no domain
  const incompleteEmailRegex = /@[^.]+$/;
  return incompleteEmailRegex.test(text) || text.endsWith('@');
};

export const suggestEmails = (text: string): string[] => {
  const handle = text.split('@')[0];
  const suggestions = [
    `${handle}@gmail.com`,
    `${handle}@yahoo.com`,
    `${handle}@outlook.com`,
    `${handle}@tuturuuu.com`,
  ];

  return suggestions.filter((suggestion) => isEmail(suggestion));
};
