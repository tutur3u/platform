import type { ThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';

type ThemeOptions = Omit<ComponentProps<typeof ThemeProvider>, 'children'>;

/** Literal source stays self-contained when Worker bundlers preserve function names. */
export function meetThemeBootstrap({
  attribute = 'data-theme',
  storageKey = 'theme',
  enableSystem = true,
  defaultTheme = enableSystem ? 'system' : 'light',
  forcedTheme,
  themes = ['light', 'dark'],
  value,
  enableColorScheme = true,
}: ThemeOptions) {
  const settings = JSON.stringify({
    attribute,
    storageKey,
    enableSystem,
    defaultTheme,
    forcedTheme,
    themes,
    value,
    enableColorScheme,
  }).replace(/</g, '\\u003c');
  return `(function(s){
    try {
      var root=document.documentElement;
      var theme=s.forcedTheme||localStorage.getItem(s.storageKey)||s.defaultTheme;
      if(s.enableSystem&&theme==='system') theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
      var attributes=Array.isArray(s.attribute)?s.attribute:[s.attribute];
      for(var i=0;i<attributes.length;i++){
        var attribute=attributes[i];
        if(attribute==='class'){
          var names=s.themes.map(function(name){return s.value&&s.value[name]||name});
          root.classList.remove.apply(root.classList,names);
          root.classList.add(s.value&&s.value[theme]||theme);
        }else root.setAttribute(attribute,theme);
      }
      if(s.enableColorScheme&&(theme==='light'||theme==='dark')) root.style.colorScheme=theme;
    }catch(error){}
  })(${settings});`;
}
