const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process')
const {publishResources}=require('../src/publish.cjs'),{createApp}=require('../src/server.cjs')
for(const [kind,platform] of [['win','win32'],['uos','linux']])test('actual '+kind+' packer publishes a delta consumed by its real client controller',{timeout:30000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'server-client-contract-')),client=path.resolve(__dirname,'../../electron-vue-skeleton-'+kind),pkg=require(path.join(client,'package.json')),resources=require(path.join(client,'src/main/services/resourceUpdates.cjs')),{ResourceUpdateController}=require(path.join(client,'src/main/services/resourceUpdateController.cjs')),AdmZip=require(path.join(client,'node_modules/adm-zip'))
 let server;try{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519'),key=path.join(root,'private.pem'),base=path.join(root,'base'),out=path.join(root,'out')
  fs.writeFileSync(key,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});fs.cpSync(path.join(client,'dist/electron/renderer'),base,{recursive:true});fs.writeFileSync(path.join(base,'index.html'),'the prior published renderer');fs.writeFileSync(path.join(base,'obsolete.js'),'remove')
  const next=require('semver').inc(pkg.version,'patch'),result=spawnSync(process.execPath,['scripts/pack-resources.cjs','--platform',platform,'--arch','x64','--version',next,'--signing-key',key,'--base-dir',base,'--base-version',pkg.version,'--out',out],{cwd:client,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))),id='electron-vue-skeleton-'+kind,selection={project:id,platform,arch:'x64',channel:'latest'}
  const config={dataDir:path.join(root,'data'),projects:{[id]:{platform,arches:['x64'],channels:['latest'],publicKey:publicKey.export({type:'spki',format:'pem'})}}}
  await publishResources(config,selection,out);server=createApp(config).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  const {expandUpdateURL}=require(path.join(client,'src/main/services/updateConfig.cjs')),url=expandUpdateURL('http://127.0.0.1:'+server.address().port+'/v1/'+id+'/'+platform+'/{arch}/latest/resources/{runtimeId}/manifest.json',{arch:'x64',runtimeId:manifest.runtimeId}),downloads=[]
  const options={root:path.join(root,'stage'),bundledDir:base,appVersion:pkg.version,publicKey,platform,arch:'x64',runtimeId:manifest.runtimeId}
  function controller(o){return new ResourceUpdateController({options:o,async readManifest(signal){const response=await fetch(url,{signal});assert.equal(response.headers.get('cache-control'),'no-store');return {manifest:await response.json(),manifestURL:url}},async readArchive(archiveURL,signal){downloads.push(archiveURL);return Buffer.from(await (await fetch(archiveURL,{signal})).arrayBuffer())}})}
  let c=controller(options);assert.equal((await c.check()).kind,'delta');assert.equal((await c.download()).status,'finished');assert.ok(downloads.at(-1).endsWith(manifest.archive))
  let entry=resources.selectEntry(options,'bundled');resources.confirm(options);assert.deepEqual(resources.inventory(path.dirname(entry)),resources.inventory(path.join(client,'dist/electron/renderer')));assert.ok(!fs.existsSync(path.join(path.dirname(entry),'obsolete.js')))
  const bad=path.join(root,'bad-base');fs.cpSync(base,bad,{recursive:true});fs.writeFileSync(path.join(bad,'index.html'),'unexpected base')
  const fallback={...options,root:path.join(root,'fallback'),bundledDir:bad};c=controller(fallback);assert.equal((await c.check()).kind,'snapshot');assert.equal((await c.download()).status,'finished');assert.ok(downloads.at(-1).endsWith(manifest.fallback.archive))
  entry=resources.selectEntry(fallback,'bundled');assert.deepEqual(resources.inventory(path.dirname(entry)),resources.inventory(path.join(client,'dist/electron/renderer')))
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}fs.rmSync(root,{recursive:true,force:true})}
})
