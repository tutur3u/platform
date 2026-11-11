import http from 'node:http';
import {gzipSync} from 'node:zlib';
const server=http.createServer(async(req,res)=>{
 try{
  const response=await fetch(`http://127.0.0.1:7846${req.url}`,{headers:{...req.headers,host:'127.0.0.1:7846','accept-encoding':'identity'}});
  const body=Buffer.from(await response.arrayBuffer());
  const headers=Object.fromEntries(response.headers);delete headers['content-length'];delete headers['transfer-encoding'];delete headers['content-encoding'];
  if(/text|javascript|json|svg/.test(headers['content-type']||'')){headers['content-encoding']='gzip';headers.vary='Accept-Encoding';res.writeHead(response.status,headers);res.end(gzipSync(body));}
  else{res.writeHead(response.status,headers);res.end(body);}
 }catch(e){res.writeHead(502);res.end(String(e));}
});server.listen(7847,'127.0.0.1',()=>console.log(`compression proxy PID ${process.pid}`));
