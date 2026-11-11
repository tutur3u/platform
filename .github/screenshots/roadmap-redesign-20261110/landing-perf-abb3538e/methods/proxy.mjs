import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const [base,label]=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome'});
for(const locale of ['en','vi']){
const page=await browser.newPage({viewport:{width:1440,height:844},isMobile:true});
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await page.addInitScript(()=>{window.__events=[];new PerformanceObserver(l=>window.__events.push(...l.getEntries().filter(e=>e.interactionId).map(e=>({name:e.name,duration:e.duration})))).observe({type:'event',buffered:true,durationThreshold:16});});
await page.goto(base+(locale==='vi'?'/vi':'/'),{waitUntil:'networkidle'});
const log=[];
const click=async locator=>{await locator.click({timeout:5000});await page.waitForTimeout(400);log.push(await locator.textContent().catch(()=>''));};
try{
 
 for(const re of [/Products|Sản phẩm/i,/Resources|Tài nguyên/i]){const el=page.getByRole('button',{name:re}).filter({visible:true}).first();if(await el.count())await click(el);}
 await page.keyboard.press('Escape');
 const theme=page.getByRole('button',{name:/Toggle theme/i}).filter({visible:true}).first();
 await click(theme);log.push('theme toggled');
 const language=page.getByRole('button',{name:/Toggle language/i}).filter({visible:true}).first();
 await click(language);console.log(await page.getByRole('menuitem').allTextContents());
 const choice=page.getByRole('menuitem',{name:/Tiếng Việt|Vietnamese/i}).first();
 if(await choice.count()){await choice.click();await page.waitForTimeout(800);log.push('language:vi');}else await page.keyboard.press('Escape');
 await page.mouse.wheel(0,600);await page.waitForTimeout(400);await page.mouse.wheel(0,-600);await page.waitForTimeout(400);
}catch(e){log.push(e.message)}
const events=await page.evaluate(()=>window.__events);await fs.writeFile(`results/${label}/${locale}-interaction.json`,JSON.stringify({log,events},null,2));console.log(locale,log,Math.max(0,...events.map(e=>e.duration)));await page.close();
}await browser.close();
