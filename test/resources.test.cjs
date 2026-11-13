const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const {fixture,listen,target}=require('./fixtures.cjs'),{publishResources}=require('../src/publish.cjs'),{payload}=require('../src/protocol.cjs')
function resource(f,version='1.0.1',runtimeId='a'.repeat(64),key=f.keys.privateKey,content='opaque signed archive '+version){
 const dir=fs.mkdtempSync(path.join(f.root,'resource-')),bytes=Buffer.from(content),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),archive='renderer-'+sha256+'.zip'
 const m={schemaVersion:1,version,platform:'win32',arch:'x64',runtimeId,sha256,archive};m.signature=crypto.sign(null,payload(m),key).toString('base64')
 fs.writeFileSync(path.join(dir,archive),bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));return {dir,m,bytes}
}
test('signed resource promotion retains old archives and isolates runtimes and project trust',async()=>{
 const f=fixture();let listener;try{
  const a=resource(f),b=resource(f,'1.0.2');await publishResources(f.config,target,a.dir);await publishResources(f.config,target,b.dir);listener=await listen(f.config)
  const base=listener.url+'/v1/win/win32/x64/latest/resources/'+a.m.runtimeId+'/'
  assert.equal((await (await fetch(base+'manifest.json')).json()).version,'1.0.2')
  assert.deepEqual(Buffer.from(await (await fetch(base+a.m.archive)).arrayBuffer()),a.bytes)
  assert.equal((await fetch(base.replace(a.m.runtimeId,'b'.repeat(64))+'manifest.json')).status,404)
  const forged=resource(f,'1.0.3','a'.repeat(64),crypto.generateKeyPairSync('ed25519').privateKey)
  await assert.rejects(()=>publishResources(f.config,target,forged.dir),/signature/)
  const corrupt=resource(f,'1.0.3');fs.writeFileSync(path.join(corrupt.dir,corrupt.m.archive),'bad');await assert.rejects(()=>publishResources(f.config,target,corrupt.dir),/checksum/)
  assert.equal((await (await fetch(base+'manifest.json')).json()).version,'1.0.2')
 }finally{if(listener)await new Promise(r=>listener.server.close(r));f.close()}
})
test('publication rejects same-version replacement and blocks overlapping writers',async()=>{
 const f=fixture();try{
  const a=resource(f);await publishResources(f.config,target,a.dir)
  const changed=resource(f,'1.0.1','a'.repeat(64),f.keys.privateKey,'different signed contents')
  await assert.rejects(()=>publishResources(f.config,target,changed.dir),/Immutable/)
  const b=resource(f,'1.0.2'),c=resource(f,'1.0.3'),results=await Promise.allSettled([publishResources(f.config,target,b.dir),publishResources(f.config,target,c.dir)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/progress/)
 }finally{f.close()}
})
test('storage symlinks and traversal cannot expose files outside the published namespace',async()=>{
 const f=fixture();let listener;try{
  const a=resource(f);await publishResources(f.config,target,a.dir)
  const secret=path.join(f.root,'private.pem');fs.writeFileSync(secret,'NOT PUBLIC')
  const file=path.join(f.config.dataDir,'win/win32/x64/latest/resources',a.m.runtimeId,'archives',a.m.archive);fs.unlinkSync(file);fs.symlinkSync(secret,file)
  listener=await listen(f.config);const base=listener.url+'/v1/win/win32/x64/latest/resources/'+a.m.runtimeId+'/'
  assert.equal((await fetch(base+a.m.archive)).status,404)
  assert.equal((await fetch(base+'%2e%2e%2fprivate.pem')).status,404)
 }finally{if(listener)await new Promise(r=>listener.server.close(r));f.close()}
})
