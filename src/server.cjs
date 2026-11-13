const express=require('express'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http')
const {once}=require('node:events'),{target,version,basename,metadataName,safeFile}=require('./config.cjs')
function createApp(config){
 const app=express();app.disable('x-powered-by');app.set('etag',false)
 app.get('/healthz',(_req,res)=>res.set('Cache-Control','no-store').json({service:'electron-update-server',ok:true,version:'1.0.0'}))
 function scope(req){return target(config,req.params)}
 function json(file){return JSON.parse(fs.readFileSync(safeFile(config.dataDir,file),'utf8'))}
 function metadata(res,file,type){res.set({'Cache-Control':'no-store','Content-Type':type,'X-Content-Type-Options':'nosniff'}).send(fs.readFileSync(safeFile(config.dataDir,file)))}
 async function artifact(req,res,file){
  file=safeFile(config.dataDir,file);const stat=fs.statSync(file),etag='"'+stat.size.toString(16)+'-'+stat.mtimeMs.toString(16)+'"'
  res.set({'Cache-Control':'public, max-age=31536000, immutable','ETag':etag,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'})
  if(req.headers['if-none-match']===etag)return res.status(304).end()
  if(req.headers['if-range']&&req.headers['if-range']!==etag)delete req.headers.range
  const ranges=req.headers.range?req.range(stat.size,{combine:false}):null
  if(ranges===-1||(Array.isArray(ranges)&&ranges.length>1000))return res.status(416).set('Content-Range','bytes */'+stat.size).end()
  if(Array.isArray(ranges)&&ranges.type==='bytes'&&ranges.length>1){
   const boundary='electron-'+crypto.randomBytes(12).toString('hex'),parts=ranges.map(r=>({r,header:`--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${r.start}-${r.end}/${stat.size}\r\n\r\n` })),tail=`--${boundary}--\r\n`
   const length=parts.reduce((n,p)=>n+Buffer.byteLength(p.header)+p.r.end-p.r.start+1+2,Buffer.byteLength(tail))
   res.status(206).set({'Content-Type':'multipart/byteranges; boundary='+boundary,'Content-Length':String(length)})
   if(req.method==='HEAD')return res.end()
   const abort=new AbortController(),stop=()=>abort.abort();res.once('close',stop)
   async function write(bytes){if(res.destroyed)throw new Error('Download closed');if(!res.write(bytes))await once(res,'drain',{signal:abort.signal})}
   try{
    for(const part of parts){await write(part.header);for await(const chunk of fs.createReadStream(file,{...part.r,signal:abort.signal}))await write(chunk);await write('\r\n')}
    return res.end(tail)
   }finally{res.off('close',stop)}
  }
  return res.sendFile(path.basename(file),{root:path.dirname(file),dotfiles:'deny',immutable:true,maxAge:'1y'},error=>{if(error&&!res.headersSent)res.sendStatus(error.statusCode||404)})
 }
 const base='/v1/:project/:platform/:arch/:channel'
 app.get(base+'/full/:name',async(req,res,next)=>{try{
  const t=scope(req);if(req.params.name!==metadataName(t))return res.sendStatus(404)
  const current=json(path.join(t.root,'full/current.json'));version(current.version)
  metadata(res,path.join(t.root,'full/versions',current.version,metadataName(t)),'text/yaml; charset=utf-8')
 }catch(error){next(error)}})
 app.get(base+'/full/versions/:version/:name',async(req,res,next)=>{try{
  const t=scope(req),v=version(req.params.version),name=basename(req.params.name),root=path.join(t.root,'full/versions',v)
  // A version exposes only its metadata and registered executable/DEB/blockmap artifacts.
  const m=require('js-yaml').load(fs.readFileSync(safeFile(config.dataDir,path.join(root,metadataName(t))),'utf8'))
  const names=m.files.flatMap(f=>{const n=decodeURIComponent(f.url.split('/').at(-1));return [n,n+'.blockmap']})
  if(!names.includes(name))return res.sendStatus(404)
  await artifact(req,res,path.join(root,name))
 }catch(error){next(error)}})
 app.get(base+'/resources/:runtime/:name',async(req,res,next)=>{try{
  const t=scope(req);if(!/^[a-f0-9]{64}$/.test(req.params.runtime))return res.sendStatus(404)
  const root=path.join(t.root,'resources',req.params.runtime),name=req.params.name
  if(name==='manifest.json'){const current=json(path.join(root,'current.json'));version(current.version);return metadata(res,path.join(root,'versions',current.version,'manifest.json'),'application/json')}
  if(!/^renderer(?:-delta)?-[a-f0-9]{64}\.zip$/.test(name))return res.sendStatus(404)
  await artifact(req,res,path.join(root,'archives',name))
 }catch(error){next(error)}})
 app.use((_req,res)=>res.sendStatus(404))
 app.use((error,_req,res,_next)=>{if(res.headersSent)res.destroy();else res.sendStatus(error instanceof URIError?400:404)})
 return app
}
function serve(config){return http.createServer({maxHeaderSize:64*1024},createApp(config)).listen(config.port,config.host)}
module.exports={createApp,serve}
