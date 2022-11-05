export const isEmail = (text: string) => {
  const emailRegex =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(text);
};

export const isIncompleteEmail = (text: string) => {
  // Incomplete email is a string that has a non-leading @ but no domain
  const incompleteEmailRegex = /@[^.]+$/;
  return incompleteEmailRegex.test(text);
};

export const suggestEmails = (text: string) => {
  const username = text.split('@')[0];
  const suggestions = [
    `${username}@gmail.com`,
    `${username}@yahoo.com`,
    `${username}@outlook.com`,
    `${username}@tuturuuu.com`,
  ];

  return suggestions.filter((suggestion) => isEmail(suggestion));
};
