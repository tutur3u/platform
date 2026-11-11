import lighthouse from 'lighthouse';import * as chromeLauncher from 'chrome-launcher';import fs from 'node:fs/promises';
const label='sealed',url='http://127.0.0.1:7847/vi';const runs=[];
for(let i=0;i<3;i++){
 const path=`results/${label}/vi-${i}.json`;let lhr;
 try{lhr=JSON.parse(await fs.readFile(path,'utf8'));}catch{}
 if(!lhr){const chrome=await chromeLauncher.launch({chromeFlags:['--headless','--no-sandbox']});try{({lhr}=await lighthouse(url,{port:chrome.port,onlyCategories:['performance'],output:'json',logLevel:'error'}));await fs.writeFile(path,JSON.stringify(lhr));}finally{await chrome.kill();}}
 runs.push({score:lhr.categories.performance.score*100,LCP:lhr.audits['largest-contentful-paint'].numericValue,TBT:lhr.audits['total-blocking-time'].numericValue,CLS:lhr.audits['cumulative-layout-shift'].numericValue,JSKB:lhr.audits['resource-summary'].details.items.find(x=>x.resourceType==='script')?.transferSize/1024});
}
const summary=JSON.parse(await fs.readFile(`results/${label}/summary.json`,'utf8')).filter(x=>!x.url.endsWith('/vi'));
const median=k=>[...runs].sort((a,b)=>a[k]-b[k])[1][k];summary.push({url,runs,median:Object.fromEntries(Object.keys(runs[0]).map(k=>[k,median(k)])),INPProxy:null});
await fs.writeFile(`results/${label}/summary.json`,JSON.stringify(summary,null,2));console.log(summary.at(-1));
