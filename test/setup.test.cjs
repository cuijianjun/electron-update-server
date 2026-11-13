const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto')
const {initLocal}=require('../src/setup.cjs'),{loadConfig}=require('../src/config.cjs')
test('local setup keeps per-project private keys outside clients and reuses them',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-setup-')),clients={}
 try{
  for(const id of ['electron-vue-skeleton-win','electron-vue-skeleton-uos']){const dir=path.join(root,id);fs.mkdirSync(path.join(dir,'config'),{recursive:true});fs.writeFileSync(path.join(dir,'config/updates.json'),JSON.stringify({autoCheck:true,intervalHours:12}));clients[id]=dir}
  const first=initLocal({userHome:root,clients}),privateBytes=first.keys.map(k=>fs.readFileSync(k.privateKeyFile)),second=initLocal({userHome:root,clients})
  assert.notEqual(first.keys[0].fingerprint,first.keys[1].fingerprint)
  assert.deepEqual(second.keys.map(k=>fs.readFileSync(k.privateKeyFile)),privateBytes)
  const c=loadConfig(first.configFile)
  for(const key of first.keys){assert.equal(fs.statSync(key.privateKeyFile).mode&0o777,0o600);const client=JSON.parse(fs.readFileSync(path.join(clients[key.project],'config/updates.json')));assert.ok(client.resourceURL.includes('{runtimeId}'));assert.ok(client.fullURL.includes('{arch}'));assert.equal(client.publicKey,c.projects[key.project].publicKey);assert.ok(!JSON.stringify(client).includes('PRIVATE KEY'))}
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('key directory symlinks are rejected before creating any private material',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-key-symlink-')),application=path.join(root,'.config/electron-update-server'),client=path.join(root,'client')
 try{
  fs.mkdirSync(application,{recursive:true});fs.mkdirSync(client,{mode:0o755});fs.symlinkSync(client,path.join(application,'keys'))
  assert.throws(()=>initLocal({userHome:root}),/symlink/i)
  assert.deepEqual(fs.readdirSync(client),[]);assert.equal(fs.statSync(client).mode&0o777,0o755)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('existing client trust requires restoring its key or explicitly starting a new deployment',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-existing-trust-')),client=path.join(root,'client'),id='electron-vue-skeleton-win'
 try{
  fs.mkdirSync(path.join(client,'config'),{recursive:true});const original=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});fs.writeFileSync(path.join(client,'config/updates.json'),JSON.stringify({publicKey:original}))
  assert.throws(()=>initLocal({userHome:root,clients:{[id]:client}}),/Restore|trust/i)
  assert.equal(JSON.parse(fs.readFileSync(path.join(client,'config/updates.json'))).publicKey,original)
  const configured=initLocal({userHome:root,clients:{[id]:client},newDeployment:true});assert.notEqual(JSON.parse(fs.readFileSync(path.join(client,'config/updates.json'))).publicKey,original)
  const bytes=fs.readFileSync(configured.keys[0].privateKeyFile);initLocal({userHome:root,clients:{[id]:client}});assert.deepEqual(fs.readFileSync(configured.keys[0].privateKeyFile),bytes)
  const file=path.join(client,'config/updates.json'),current=JSON.parse(fs.readFileSync(file));fs.writeFileSync(file,JSON.stringify({...current,publicKey:original}))
  assert.throws(()=>initLocal({userHome:root,clients:{[id]:client}}),/trust differs/);assert.deepEqual(fs.readFileSync(configured.keys[0].privateKeyFile),bytes)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
