import React from 'react';
// import { ThemeToggle } from './theme-toggle';
import { LanguageWrapper } from './language-wrapper';
// import LanguageToggle from './language-toggle';
export default function NavbarActions() {
  return (
    <div className='relative'>
        <div className='flex items-center gap-1'>
            <LanguageWrapper></LanguageWrapper>
            {/* <ThemeToggle></ThemeToggle> */}
        </div>
    </div>
  )
}
