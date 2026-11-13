const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process')
const {atomic}=require('./publish.cjs')
const projects={
 'electron-vue-skeleton-win':{platform:'win32',arches:['x64']},
 'electron-vue-skeleton-uos':{platform:'linux',arches:['x64','arm64']}
}
function locations(userHome=os.homedir()){
 const configDir=path.join(userHome,'.config/electron-update-server')
 return {configDir,keyDir:path.join(configDir,'keys'),configFile:path.join(configDir,'config.json'),dataDir:path.join(userHome,'.local/share/electron-update-server')}
}
function initLocal({userHome=os.homedir(),clients={},port=25565,newDeployment=false}={}){
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port')
 userHome=fs.realpathSync(userHome)
 const loc=locations(userHome),clientConfigs={}
 for(const [id,client] of Object.entries(clients)){
  if(!Object.hasOwn(projects,id))throw new Error('Unknown client project')
  const current=JSON.parse(fs.readFileSync(path.join(client,'config/updates.json'),'utf8'))
  if(!current||typeof current!=='object'||Array.isArray(current))throw new Error('Invalid client configuration')
  if(current.publicKey&&!fs.existsSync(path.join(loc.keyDir,id+'-private.pem'))&&!newDeployment)throw new Error('Restore the existing signing private key for client trust, or explicitly use --new-deployment')
  clientConfigs[id]=current
 }
 for(const dir of [loc.configDir,loc.keyDir,loc.dataDir]){
  let cursor=userHome
  for(const part of path.relative(userHome,dir).split(path.sep)){
   cursor=path.join(cursor,part)
   if(fs.existsSync(cursor)){if(fs.lstatSync(cursor).isSymbolicLink()||!fs.lstatSync(cursor).isDirectory())throw new Error('Configuration/key directory symlink is forbidden')}
   else fs.mkdirSync(cursor,{mode:0o700})
  }
  fs.chmodSync(dir,0o700)
 }
 const configured={},keys=[]
 for(const [id,p] of Object.entries(projects)){
  const privateFile=path.join(loc.keyDir,id+'-private.pem'),publicFile=path.join(loc.keyDir,id+'-public.pem')
  if(!fs.existsSync(privateFile)){const key=crypto.generateKeyPairSync('ed25519').privateKey;fs.writeFileSync(privateFile,key.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600})}
  if(fs.lstatSync(privateFile).isSymbolicLink()||!fs.lstatSync(privateFile).isFile())throw new Error('Invalid private key file')
  const key=crypto.createPrivateKey(fs.readFileSync(privateFile));if(key.asymmetricKeyType!=='ed25519')throw new Error('Invalid private key type')
  fs.chmodSync(privateFile,0o600)
  const publicKey=crypto.createPublicKey(key),pem=publicKey.export({type:'spki',format:'pem'})
  if(fs.existsSync(publicFile)){if(fs.lstatSync(publicFile).isSymbolicLink()||fs.readFileSync(publicFile,'utf8')!==pem)throw new Error('Existing public key does not match; no key was overwritten')}
  else fs.writeFileSync(publicFile,pem,{flag:'wx',mode:0o644})
  const current=clientConfigs[id]
  if(current?.publicKey&&!newDeployment&&!crypto.createPublicKey(current.publicKey).export({type:'spki',format:'der'}).equals(publicKey.export({type:'spki',format:'der'})))throw new Error('Existing client trust differs from the signing key; use --new-deployment only for new clients')
  configured[id]={...p,channels:['latest'],publicKey:pem}
  keys.push({project:id,publicKeyFile:publicFile,privateKeyFile:privateFile,fingerprint:crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex')})
 }
 const config={host:'127.0.0.1',port,dataDir:loc.dataDir,projects:configured}
 atomic(loc.configFile,config)
 for(const [id,client] of Object.entries(clients)){
  if(!configured[id])throw new Error('Unknown client project')
  const file=path.join(client,'config/updates.json'),current=clientConfigs[id],base='http://127.0.0.1:'+port+'/v1/'+id+'/'+configured[id].platform+'/{arch}/latest/'
  atomic(file,{...current,fullURL:base+'full/',resourceURL:base+'resources/{runtimeId}/manifest.json',publicKey:configured[id].publicKey})
 }
 return {...loc,keys,port}
}
function installService(configFile,{userHome=os.homedir(),node=process.execPath,entry=path.join(__dirname,'cli.cjs')}={}){
 if(process.platform!=='darwin')throw new Error('Use npm start or Docker on this system; LaunchAgent installation is macOS-only')
 const label='com.cjjxw.electron-update-server',file=path.join(userHome,'Library/LaunchAgents',label+'.plist'),logDir=path.join(locations(userHome).dataDir,'logs')
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(logDir,{recursive:true,mode:0o700})
 const escape=x=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
 const args=[node,entry,'serve','--config',path.resolve(configFile)]
 const body=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(x=>'<string>'+escape(x)+'</string>').join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${escape(path.join(logDir,'stdout.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(logDir,'stderr.log'))}</string></dict></plist>\n`
 for(const name of ['stdout.log','stderr.log'])fs.closeSync(fs.openSync(path.join(logDir,name),'a',0o600))
 if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')!==body)throw new Error('Existing LaunchAgent differs; inspect it before replacing')
 if(!fs.existsSync(file))fs.writeFileSync(file,body,{flag:'wx',mode:0o600})
 const domain='gui/'+process.getuid(),service=domain+'/'+label
 try{execFileSync('/bin/launchctl',['print',service],{stdio:'ignore'});execFileSync('/bin/launchctl',['kickstart','-k',service])}
 catch(error){if(error.status===undefined)throw error;execFileSync('/bin/launchctl',['bootstrap',domain,file])}
 return {label,file,logDir}
}
module.exports={initLocal,locations,installService}
