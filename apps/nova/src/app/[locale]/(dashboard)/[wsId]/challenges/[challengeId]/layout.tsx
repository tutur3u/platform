import Header from './customizedHeader';
import React from 'react';


interface LayoutProps {
  children: React.ReactNode;
}
export default function layout({children} : LayoutProps) {
  return <>
    <Header></Header>
    <div className=''>
        {children}
    </div>
  </>;
}
