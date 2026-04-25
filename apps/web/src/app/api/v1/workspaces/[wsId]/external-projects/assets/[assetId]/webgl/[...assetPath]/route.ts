import { posix } from 'node:path';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import {
  inferWebglAssetHeaders,
  parseWebglPackageArtifactMetadata,
  WEBGL_PACKAGE_ASSET_TYPE,
} from '@/lib/external-projects/webgl-packages';
import {
  downloadWorkspaceStorageObjectForProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const WEBGL_VIEWPORT_FILL_MARKER = 'data-tuturuuu-webgl-viewport-fill';

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function rewriteWebglHtmlDocument(html: string) {
  return html
    .replaceAll(
      /<script(?![^>]*\bdata-cfasync=)/gi,
      '<script data-cfasync="false"'
    )
    .replaceAll(
      /\balert\s*\(\s*message\s*\)/g,
      'console.error(message); if (typeof unityShowBanner === "function") unityShowBanner(String(message), "error")'
    );
}

function injectWebglViewportFill(
  html: string,
  baseHref: string,
  assetUrls: Record<string, string>
) {
  if (html.includes(WEBGL_VIEWPORT_FILL_MARKER)) {
    return html;
  }

  const rewrittenHtml = rewriteWebglHtmlDocument(html);
  const base = `<base ${WEBGL_VIEWPORT_FILL_MARKER} href="${escapeHtmlAttribute(baseHref)}">`;
  const injection = `<style ${WEBGL_VIEWPORT_FILL_MARKER}>
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000!important;}
body{position:fixed!important;inset:0!important;}
#unity-container{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important;}
#unity-container.unity-desktop{left:0!important;top:0!important;transform:none!important;}
#unity-canvas{position:absolute!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;display:block!important;background:#231f20!important;}
#unity-loading-bar{position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;z-index:3!important;}
#unity-warning{position:fixed!important;top:16px!important;right:16px!important;left:16px!important;z-index:4!important;}
#unity-footer,#unity-webgl-logo,#unity-build-title,#unity-fullscreen-button{display:none!important;}
#tuturuuu-webgl-download-status{position:fixed;right:16px;bottom:16px;z-index:5;min-width:220px;max-width:min(420px,calc(100vw - 32px));border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(0,0,0,.72);padding:10px 12px;color:#fff;font:12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.3);backdrop-filter:blur(10px);}
#tuturuuu-webgl-download-status[hidden]{display:none!important;}
#tuturuuu-webgl-download-status span{display:block;color:#fff;font-weight:600;}
#tuturuuu-webgl-download-status .tuturuuu-webgl-download-track{height:4px;margin-top:8px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.22);}
#tuturuuu-webgl-download-status .tuturuuu-webgl-download-bar{height:100%;width:0;background:#fff;transition:width .18s ease;}
</style><script ${WEBGL_VIEWPORT_FILL_MARKER} data-cfasync="false">
(function(){
var maxDpr=2;
var requests={};
var hideTimer=0;
var originalFetch=window.fetch;
var OriginalXhr=window.XMLHttpRequest;
var baseHref=${JSON.stringify(baseHref)};
var assetUrls=${JSON.stringify(assetUrls)};
var currentCreateUnityInstance=window.createUnityInstance;
function decodePath(value){
try{return decodeURIComponent(value);}
catch(error){return value;}
}
function assetUrlFor(value){
if(typeof value!=='string'||!value){return value;}
var url=new URL(value,baseHref);
var basePath=new URL(baseHref,window.location.href).pathname;
var relativePath=url.pathname.indexOf(basePath)===0?url.pathname.slice(basePath.length):url.pathname.replace(/^\\/+/, '');
relativePath=decodePath(relativePath);
return assetUrls[relativePath]||assetUrls[relativePath.replace(/^\\/+/, '')]||url.pathname;
}
function packageUrl(value){
if(typeof value!=='string'||!value){return value;}
if(/^(?:blob:|data:|javascript:)/i.test(value)){return value;}
if(/^[a-z][a-z0-9+.-]*:/i.test(value)){
try{
var absoluteUrl=new URL(value);
if(absoluteUrl.origin!==window.location.origin){return value;}
}catch(error){
return value;
}
}
return assetUrlFor(value);
}
function rewriteUnityConfig(config){
if(!config||typeof config!=='object'){return config;}
['dataUrl','frameworkUrl','codeUrl','memoryUrl','symbolsUrl','streamingAssetsUrl'].forEach(function(key){
if(typeof config[key]==='string'){config[key]=packageUrl(config[key]);}
});
return config;
}
function wrapUnityFactory(value){
if(typeof value!=='function'||value.__tuturuuuPatched){return value;}
var patched=function(canvas,config,onProgress){
return value.call(this,canvas,rewriteUnityConfig(config),onProgress);
};
patched.__tuturuuuPatched=true;
return patched;
}
Object.defineProperty(window,'createUnityInstance',{
configurable:true,
get:function(){return currentCreateUnityInstance;},
set:function(value){currentCreateUnityInstance=wrapUnityFactory(value);}
});
currentCreateUnityInstance=wrapUnityFactory(currentCreateUnityInstance);
function formatBytes(bytes){
if(!Number.isFinite(bytes)||bytes<=0){return '0 B';}
var units=['B','KB','MB','GB'];
var value=bytes;
var unit=0;
while(value>=1024&&unit<units.length-1){value=value/1024;unit+=1;}
return (unit===0?String(Math.round(value)):value.toFixed(value>=10?1:2))+' '+units[unit];
}
function downloadText(){
var loaded=0;
var total=0;
var hasTotal=false;
var active=0;
Object.keys(requests).forEach(function(key){
var request=requests[key];
loaded+=request.loaded||0;
if(request.total>0){total+=request.total;hasTotal=true;}
if(!request.done){active+=1;}
});
var percent=hasTotal&&total>0?Math.max(0,Math.min(100,Math.round(loaded/total*100))):0;
return {active:active,hasTotal:hasTotal,loaded:loaded,percent:percent,total:total};
}
function ensureStatus(){
var status=document.getElementById('tuturuuu-webgl-download-status');
if(status){return status;}
if(!document.body){return null;}
status=document.createElement('div');
status.id='tuturuuu-webgl-download-status';
status.hidden=true;
status.innerHTML='<span></span><div class="tuturuuu-webgl-download-track"><div class="tuturuuu-webgl-download-bar"></div></div>';
document.body.appendChild(status);
return status;
}
function renderDownloads(){
var summary=downloadText();
var status=ensureStatus();
if(!status){return;}
var label=status.querySelector('span');
var bar=status.querySelector('.tuturuuu-webgl-download-bar');
if(summary.active<=0&&summary.loaded<=0){status.hidden=true;return;}
status.hidden=false;
if(label){label.textContent=summary.hasTotal?formatBytes(summary.loaded)+' / '+formatBytes(summary.total):formatBytes(summary.loaded);}
if(bar){bar.style.width=summary.hasTotal?summary.percent+'%':'18%';}
if(summary.active<=0){
window.clearTimeout(hideTimer);
hideTimer=window.setTimeout(function(){status.hidden=true;},1200);
}
}
function isTrackedUrl(input){
try{
var url=new URL(typeof input==='string'?input:input&&input.url?input.url:String(input),window.location.href);
var base=window.location.pathname.replace(/\\/[^/]*$/,'/');
return url.origin===window.location.origin&&url.pathname.indexOf(base)===0&&url.pathname!==window.location.pathname;
}catch(error){
return false;
}
}
function trackStart(url,total){
var id=String(Date.now())+'-'+Math.random();
requests[id]={done:false,loaded:0,total:total||0,url:url};
renderDownloads();
return id;
}
function trackProgress(id,loaded,total,done){
if(!requests[id]){return;}
requests[id].loaded=Math.max(requests[id].loaded||0,loaded||0);
if(total>0){requests[id].total=total;}
requests[id].done=Boolean(done);
renderDownloads();
}
function patchFetch(){
if(!originalFetch){return;}
window.fetch=function(input,init){
if(typeof input==='string'){input=packageUrl(input);}
if(!isTrackedUrl(input)){return originalFetch.call(this,input,init);}
return originalFetch.call(this,input,init).then(function(response){
var total=Number(response.headers.get('content-length')||0);
var id=trackStart(response.url,total);
if(!response.body||!window.ReadableStream){
trackProgress(id,total,total,true);
return response;
}
var reader=response.body.getReader();
var loaded=0;
var stream=new ReadableStream({
pull:function(controller){
return reader.read().then(function(result){
if(result.done){
trackProgress(id,loaded,total,true);
controller.close();
return;
}
loaded+=result.value.byteLength;
trackProgress(id,loaded,total,false);
controller.enqueue(result.value);
});
},
cancel:function(reason){
trackProgress(id,loaded,total,true);
return reader.cancel(reason);
}
});
return new Response(stream,{headers:response.headers,status:response.status,statusText:response.statusText});
}).catch(function(error){
renderDownloads();
throw error;
});
};
}
function patchElementUrlSetters(){
var originalSetAttribute=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(name,value){
var lowerName=String(name).toLowerCase();
if((lowerName==='src'||lowerName==='href')&&typeof value==='string'){
value=packageUrl(value);
}
return originalSetAttribute.call(this,name,value);
};
[
[window.HTMLScriptElement&&window.HTMLScriptElement.prototype,'src'],
[window.HTMLLinkElement&&window.HTMLLinkElement.prototype,'href'],
[window.HTMLImageElement&&window.HTMLImageElement.prototype,'src']
].forEach(function(entry){
var proto=entry[0];
var property=entry[1];
if(!proto){return;}
var descriptor=Object.getOwnPropertyDescriptor(proto,property);
if(!descriptor||!descriptor.set||!descriptor.get){return;}
Object.defineProperty(proto,property,{
configurable:true,
get:function(){return descriptor.get.call(this);},
set:function(value){return descriptor.set.call(this,packageUrl(value));}
});
});
}
function patchXhr(){
if(!OriginalXhr){return;}
window.XMLHttpRequest=function(){
var xhr=new OriginalXhr();
var id='';
var track=false;
var open=xhr.open;
xhr.open=function(method,url){
if(typeof url==='string'){url=packageUrl(url);}
track=isTrackedUrl(url);
return open.call(xhr,method,url,arguments[2],arguments[3],arguments[4]);
};
xhr.addEventListener('loadstart',function(event){
if(track&&!id){id=trackStart(xhr.responseURL||'',event.lengthComputable?event.total:0);}
});
xhr.addEventListener('progress',function(event){
if(track){
if(!id){id=trackStart(xhr.responseURL||'',event.lengthComputable?event.total:0);}
trackProgress(id,event.loaded,event.lengthComputable?event.total:0,false);
}
});
xhr.addEventListener('loadend',function(event){
if(track){
if(!id){id=trackStart(xhr.responseURL||'',event.lengthComputable?event.total:0);}
trackProgress(id,event.loaded||0,event.lengthComputable?event.total:0,true);
}
});
return xhr;
};
window.XMLHttpRequest.prototype=OriginalXhr.prototype;
window.XMLHttpRequest.UNSENT=OriginalXhr.UNSENT;
window.XMLHttpRequest.OPENED=OriginalXhr.OPENED;
window.XMLHttpRequest.HEADERS_RECEIVED=OriginalXhr.HEADERS_RECEIVED;
window.XMLHttpRequest.LOADING=OriginalXhr.LOADING;
window.XMLHttpRequest.DONE=OriginalXhr.DONE;
}
function fit(){
var container=document.getElementById('unity-container');
var canvas=document.getElementById('unity-canvas');
var width=Math.max(1,window.innerWidth||document.documentElement.clientWidth||960);
var height=Math.max(1,window.innerHeight||document.documentElement.clientHeight||540);
if(container){
container.style.position='fixed';
container.style.inset='0';
container.style.width=width+'px';
container.style.height=height+'px';
container.style.maxWidth='none';
container.style.maxHeight='none';
container.style.margin='0';
container.style.padding='0';
container.style.overflow='hidden';
}
if(canvas){
canvas.style.position='absolute';
canvas.style.inset='0';
canvas.style.width=width+'px';
canvas.style.height=height+'px';
canvas.style.maxWidth='none';
canvas.style.maxHeight='none';
var dpr=Math.min(maxDpr,Math.max(1,window.devicePixelRatio||1));
var nextWidth=Math.round(width*dpr);
var nextHeight=Math.round(height*dpr);
if(canvas.width!==nextWidth){canvas.width=nextWidth;}
if(canvas.height!==nextHeight){canvas.height=nextHeight;}
}
}
function tick(){
fit();
renderDownloads();
if(tick.frames<300){
tick.frames+=1;
window.requestAnimationFrame(tick);
}
}
tick.frames=0;
patchElementUrlSetters();
patchFetch();
patchXhr();
window.addEventListener('resize',fit,{passive:true});
window.addEventListener('orientationchange',fit,{passive:true});
document.addEventListener('DOMContentLoaded',tick);
if(document.readyState==='loading'){fit();}else{tick();}
})();
</script>`;

  const withBase = rewrittenHtml.includes('<head>')
    ? rewrittenHtml.replace('<head>', `<head>${base}`)
    : `${base}${rewrittenHtml}`;

  return withBase.includes('</head>')
    ? withBase.replace('</head>', `${injection}</head>`)
    : `${injection}${withBase}`;
}

function shouldInjectWebglViewportFill(input: {
  contentEncoding?: string;
  contentType: string;
  relativePath: string;
}) {
  return (
    !input.contentEncoding &&
    input.contentType.toLowerCase().startsWith('text/html') &&
    input.relativePath.toLowerCase().endsWith('.html')
  );
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      assetId: string;
      assetPath: string[];
      wsId: string;
    }>;
  }
) {
  const { assetId, assetPath, wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const resolvedWsId = resolveWorkspaceId(wsId);

  try {
    const binding = await resolveWorkspaceExternalProjectBinding(
      resolvedWsId,
      admin
    );
    if (!binding.enabled || !binding.canonical_project) {
      return NextResponse.json(
        { error: 'External project delivery unavailable for this workspace' },
        { status: 404 }
      );
    }

    const { data: asset, error } = await admin
      .from('workspace_external_project_assets')
      .select(
        'id, ws_id, asset_type, metadata, workspace_external_project_entries!inner(status)'
      )
      .eq('id', assetId)
      .eq('ws_id', resolvedWsId)
      .eq('asset_type', WEBGL_PACKAGE_ASSET_TYPE)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const entryStatus = asset.workspace_external_project_entries?.status;
    if (entryStatus !== 'published') {
      const access = await requireWorkspaceExternalProjectAccess({
        mode: 'read',
        request,
        wsId,
      });

      if (!access.ok) {
        return NextResponse.json(
          { error: 'Asset not available' },
          { status: 404 }
        );
      }
    }

    const metadata = parseWebglPackageArtifactMetadata(asset.metadata);
    if (!metadata) {
      return NextResponse.json(
        { error: 'WebGL artifact map not available' },
        { status: 404 }
      );
    }

    const relativePath = sanitizePath(assetPath.join('/'));
    if (!relativePath) {
      return NextResponse.json(
        { error: 'Missing WebGL asset path' },
        { status: 400 }
      );
    }

    const storagePath = sanitizePath(
      posix.join(metadata.rootPath, relativePath)
    );
    if (
      !storagePath ||
      (storagePath !== metadata.rootPath &&
        !storagePath.startsWith(`${metadata.rootPath}/`))
    ) {
      return NextResponse.json(
        { error: 'Invalid WebGL asset path' },
        { status: 403 }
      );
    }

    const downloaded = await downloadWorkspaceStorageObjectForProvider(
      resolvedWsId,
      metadata.provider,
      storagePath
    );
    const inferred = inferWebglAssetHeaders(relativePath);
    const contentType =
      inferred.isKnownType ||
      !downloaded.contentType ||
      downloaded.contentType === 'application/octet-stream'
        ? inferred.contentType
        : downloaded.contentType;
    const headers = new Headers({
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    });

    if (inferred.contentEncoding) {
      headers.set('Content-Encoding', inferred.contentEncoding);
    }

    const responseBody = shouldInjectWebglViewportFill({
      contentEncoding: inferred.contentEncoding,
      contentType,
      relativePath,
    })
      ? new TextEncoder().encode(
          injectWebglViewportFill(
            new TextDecoder().decode(downloaded.buffer),
            new URL(request.url).pathname.replace(/\/[^/]*$/, '/'),
            metadata.assetUrls
          )
        )
      : downloaded.buffer.slice();
    headers.set('Content-Length', String(responseBody.byteLength));

    return new Response(responseBody.buffer as ArrayBuffer, {
      headers,
      status: 200,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to serve WebGL package asset', error);
    return NextResponse.json(
      { error: 'Failed to serve WebGL package asset' },
      { status: 500 }
    );
  }
}
