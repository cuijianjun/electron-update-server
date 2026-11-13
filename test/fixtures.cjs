const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto')
const {createApp}=require('../src/server.cjs')
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-server-')),keys=crypto.generateKeyPairSync('ed25519')
 const config={host:'127.0.0.1',port:25565,dataDir:path.join(root,'data'),projects:{win:{platform:'win32',arches:['x64'],channels:['latest'],publicKey:keys.publicKey.export({type:'spki',format:'pem'})}}}
 return {root,config,keys,close(){fs.rmSync(root,{recursive:true,force:true})}}
}
async function listen(config){const server=createApp(config).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {server,url:'http://127.0.0.1:'+server.address().port}}
function full(f,version='1.0.1',bytes=Buffer.from('MZ controlled Windows fixture')){
 const dir=path.join(f.root,version);fs.mkdirSync(dir);const name='myapp Setup '+version+'.exe',sha=crypto.createHash('sha512').update(bytes).digest('base64')
 fs.writeFileSync(path.join(dir,name),bytes);fs.writeFileSync(path.join(dir,name+'.blockmap'),'map-'+version)
 fs.writeFileSync(path.join(dir,'latest.yml'),`version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${sha}\n`)
 return {dir,name,bytes}
}
const target={project:'win',platform:'win32',arch:'x64',channel:'latest'}
module.exports={fixture,listen,full,target}
