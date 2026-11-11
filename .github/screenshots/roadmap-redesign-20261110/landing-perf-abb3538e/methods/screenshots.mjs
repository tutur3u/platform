import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
for(const [label,base] of [['before','https://tuturuuu.com'],['after','http://127.0.0.1:7847']]){
 if(process.argv[2] && label!==process.argv[2])continue;
 await fs.mkdir(`publish/${label}`,{recursive:true});
 for(const locale of ['en','vi'])for(const width of [390,1440])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},colorScheme:theme});
  await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
  await page.goto(base+(locale==='vi'?'/vi':'/'),{waitUntil:'networkidle'});
  await page.evaluate(t=>{document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.classList.toggle('light',t==='light');},theme);
  await page.screenshot({path:`publish/${label}/${locale}-${theme}-${width}.png`});await page.close();
 }
}await browser.close();
