try {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
} catch {
  // Storage can be unavailable in privacy modes; retain the system theme.
}
