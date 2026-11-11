import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const [base, label] = process.argv.slice(2);
await fs.mkdir(`results/${label}`, {recursive:true});
const summary=[];
for (const locale of ['en','vi']) {
 const url=base+(locale==='vi'?'/vi':'/');
 const runs=[];
 for(let i=0;i<3;i++) {
  const chrome=await chromeLauncher.launch({chromeFlags:['--headless','--no-sandbox']});
  try {
   const {lhr}=await lighthouse(url,{port:chrome.port,onlyCategories:['performance'],output:'json',logLevel:'error'});
   await fs.writeFile(`results/${label}/${locale}-${i}.json`,JSON.stringify(lhr));
   runs.push({score:lhr.categories.performance.score*100,LCP:lhr.audits['largest-contentful-paint'].numericValue,TBT:lhr.audits['total-blocking-time'].numericValue,CLS:lhr.audits['cumulative-layout-shift'].numericValue,JSKB:lhr.audits['resource-summary'].details.items.find(x=>x.resourceType==='script')?.transferSize/1024});
  } finally { await chrome.kill(); }
 }
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{window.__events=[];new PerformanceObserver(l=>window.__events.push(...l.getEntries().filter(e=>e.interactionId).map(e=>({name:e.name,duration:e.duration})))).observe({type:'event',buffered:true,durationThreshold:16});});
 await page.goto(url,{waitUntil:'networkidle'});
 const actions=[];
 for(const name of [/menu/i,/products/i,/resources/i,/toggle theme/i,/dark/i,/toggle language/i,/Vietnamese|Tiếng Việt|English/i]) {
  const button=page.getByRole('button',{name}).first();
  if(await button.isVisible().catch(()=>false)){await button.click();await page.waitForTimeout(300);actions.push(String(name));}
 }
 await page.mouse.wheel(0,650);await page.waitForTimeout(500);await page.mouse.wheel(0,-650);
 const events=await page.evaluate(()=>window.__events);
 await fs.writeFile(`results/${label}/${locale}-interaction.json`,JSON.stringify({actions,events}));
 for(const width of [390,1440]) for(const theme of ['light','dark']) {
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.emulateMedia({colorScheme:theme});
  await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
  await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(t=>{localStorage.setItem('theme',t);document.documentElement.classList.toggle('dark',t==='dark');},theme);
  for(let step=0;step<45;step++){await page.mouse.wheel(0,650);await page.waitForTimeout(100);if(await page.evaluate(()=>window.scrollY+innerHeight>=document.documentElement.scrollHeight-2))break;}
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
  await page.screenshot({path:`results/${label}/${locale}-${theme}-${width}.png`,fullPage:true});
 }
 await browser.close();
 const median=key=>[...runs].sort((a,b)=>a[key]-b[key])[1][key];
 summary.push({url,runs,median:Object.fromEntries(Object.keys(runs[0]).map(k=>[k,median(k)])),INPProxy:Math.max(0,...events.map(e=>e.duration))});
 await fs.writeFile(`results/${label}/summary.json`,JSON.stringify(summary,null,2));
 console.log(summary.at(-1));
}
