import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});const results=[];
for(const locale of ['en','vi']){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:7847/'+(locale==='vi'?'vi':''),{waitUntil:'networkidle'});
 const initial=await page.evaluate(()=>({dom:document.querySelectorAll('*').length,headings:[...document.querySelectorAll('h1')].map(x=>({text:x.textContent,top:x.getBoundingClientRect().top,hidden:!!x.closest('[hidden]')})),styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>({href:x.getAttribute('href'),crossOrigin:x.crossOrigin})),scripts:performance.getEntriesByType('resource').filter(x=>x.name.endsWith('.js')).length,animations:document.getAnimations().length,brand:!!document.querySelector('#navbar-content a span'),overflow:document.documentElement.scrollWidth>innerWidth}));
 const menu=page.locator('#navbar button').filter({visible:true}).last();await menu.click();await page.waitForTimeout(600);await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('a[href="#demo"]').click();await page.waitForTimeout(1200);
 const demo=await page.locator('#demo').isVisible();
 for(let i=0;i<50;i++){await page.mouse.wheel(0,700);await page.waitForTimeout(120);if(await page.evaluate(()=>scrollY+innerHeight>=document.documentElement.scrollHeight-2))break;}
 const after=await page.evaluate(()=>({dom:document.querySelectorAll('*').length,headings:[...document.querySelectorAll('h1')].map(x=>({text:x.textContent,top:x.getBoundingClientRect().top,hidden:!!x.closest('[hidden]')})),animations:document.getAnimations().length,overflow:document.documentElement.scrollWidth>innerWidth}));
 results.push({locale,initial,demo,after,errors});await page.close();
}await browser.close();await fs.writeFile('qa.json',JSON.stringify(results,null,2));console.log(results);
