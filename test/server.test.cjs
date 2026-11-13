const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto')
const {createApp}=require('../src/server.cjs'),{publishFull,publishResources}=require('../src/publish.cjs')
const {fixture,listen,full,target}=require('./fixtures.cjs')
test('full releases stay immutable; metadata switches last and older URLs remain downloadable',async()=>{
 const f=fixture();let listener;try{
  const a=full(f,'1.0.0'),b=full(f);await publishFull(f.config,target,a.dir);await publishFull(f.config,target,b.dir)
  listener=await listen(f.config);const base=listener.url+'/v1/win/win32/x64/latest/full/'
  const metadata=await fetch(base+'latest.yml');assert.match(await metadata.text(),/versions\/1.0.1\//);assert.equal(metadata.headers.get('cache-control'),'no-store')
  assert.deepEqual(Buffer.from(await (await fetch(base+'versions/1.0.0/'+encodeURIComponent(a.name))).arrayBuffer()),a.bytes)
  assert.equal(await (await fetch(base+'versions/1.0.0/'+encodeURIComponent(a.name)+'.blockmap')).text(),'map-1.0.0')
  fs.writeFileSync(path.join(b.dir,b.name),'changed');await assert.rejects(()=>publishFull(f.config,target,b.dir),/hash|checksum|immutable/i)
  assert.match(await (await fetch(base+'latest.yml')).text(),/1.0.1/)
  assert.equal((await fetch(base+'versions/1.0.1/release.json')).status,404)
 }finally{if(listener)await new Promise(r=>listener.server.close(r));f.close()}
})
test('GET HEAD single and multipart ranges preserve requested order without coalescing',async()=>{
 const f=fixture();let listener;try{
  const a=full(f,'1.0.0',Buffer.from('MZ0123456789abcdef'));await publishFull(f.config,target,a.dir);listener=await listen(f.config)
  const url=listener.url+'/v1/win/win32/x64/latest/full/versions/1.0.0/'+encodeURIComponent(a.name)
  let response=await fetch(url,{headers:{Range:'bytes=2-4'}});assert.equal(response.status,206);assert.equal(await response.text(),'012');assert.equal(response.headers.get('content-range'),'bytes 2-4/18')
  response=await fetch(url,{headers:{Range:'bytes=7-8,2-4'}});assert.equal(response.status,206);const body=await response.text();assert.ok(body.indexOf('bytes 7-8/18')<body.indexOf('bytes 2-4/18'));assert.match(response.headers.get('content-type'),/multipart\/byteranges/)
  assert.equal((await fetch(url,{method:'HEAD'})).headers.get('content-length'),'18')
  assert.equal((await fetch(url,{headers:{Range:'bytes=999-'}})).status,416)
  assert.equal((await fetch(listener.url+'/v1/uos/linux/x64/latest/full/latest.yml')).status,404)
  assert.equal((await fetch(listener.url+'/keys/win-private.pem')).status,404)
 }finally{if(listener)await new Promise(r=>listener.server.close(r));f.close()}
})
test('publication refuses a linked versions directory without writing outside storage',async()=>{
 const f=fixture();try{
  const a=full(f,'1.0.0'),root=path.join(f.config.dataDir,'win/win32/x64/latest/full'),outside=path.join(f.root,'outside')
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'versions'))
  await assert.rejects(()=>publishFull(f.config,target,a.dir),/symlink/i)
  assert.deepEqual(fs.readdirSync(outside),[])
 }finally{f.close()}
})
test('aborting a multipart response releases the stream and subsequent downloads still work',{timeout:15000},async()=>{
 const f=fixture();let listener;try{
  const bytes=crypto.randomBytes(4*1024*1024);bytes.write('MZ');const a=full(f,'1.0.0',bytes);await publishFull(f.config,target,a.dir);listener=await listen(f.config)
  const url=listener.url+'/v1/win/win32/x64/latest/full/versions/1.0.0/'+encodeURIComponent(a.name)
  await new Promise(resolve=>{const request=require('node:http').get(url,{headers:{Range:'bytes=0-1048575,2097152-3145727'}},res=>res.once('data',()=>request.destroy()));request.on('error',()=>{});request.once('close',resolve)})
  await new Promise(r=>setTimeout(r,100));assert.equal((await fetch(listener.url+'/healthz')).status,200)
  assert.equal((await fetch(url,{headers:{Range:'bytes=2-8'}})).status,206)
 }finally{if(listener){listener.server.closeAllConnections();await new Promise(r=>listener.server.close(r))}f.close()}
})
test('a hidden private storage ancestor does not block registered artifact downloads',async()=>{
 const f=fixture();let listener;try{
  f.config.dataDir=path.join(f.root,'.private','data');const a=full(f,'1.0.0');await publishFull(f.config,target,a.dir);listener=await listen(f.config)
  const url=listener.url+'/v1/win/win32/x64/latest/full/versions/1.0.0/'+encodeURIComponent(a.name)
  assert.equal((await fetch(url,{headers:{Range:'bytes=0-3'}})).status,206)
  assert.equal((await fetch(listener.url+'/.private/data')).status,404)
 }finally{if(listener)await new Promise(r=>listener.server.close(r));f.close()}
})
