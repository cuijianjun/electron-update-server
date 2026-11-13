const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),yaml=require('js-yaml'),semver=require('semver')
const {target,version,basename,metadataName,safeFile,ensureStorage}=require('./config.cjs'),{verify}=require('./protocol.cjs')
function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function atomic(file,value){const tmp=file+'.tmp-'+crypto.randomUUID();try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}}
async function digest(file){
 const sha256=crypto.createHash('sha256'),sha512=crypto.createHash('sha512');let size=0
 for await(const chunk of fs.createReadStream(file)){size+=chunk.length;sha256.update(chunk);sha512.update(chunk)}
 return {size,sha256:sha256.digest('hex'),sha512:sha512.digest('base64')}
}
async function copyChecked(source,dest,expected){
 if(!fs.lstatSync(source).isFile()||fs.lstatSync(source).isSymbolicLink())throw new Error('Source artifact must be a regular file')
 await fsp.copyFile(source,dest,fs.constants.COPYFILE_EXCL);const actual=await digest(dest)
 if(Object.entries(expected).some(([k,v])=>v!==undefined&&actual[k]!==v))throw new Error('Artifact checksum/size mismatch')
 return actual
}
async function transaction(dataRoot,root,releaseVersion,work){
 ensureStorage(dataRoot,root);const lock=path.join(root,'.publish-lock')
 try{fs.mkdirSync(lock)}catch{throw new Error('Another publication is in progress; inspect the lock before retrying')}
 let staging
 try{
  version(releaseVersion);const current=path.join(root,'current.json')
  if(fs.existsSync(current))safeFile(dataRoot,current)
  if(fs.existsSync(current)&&semver.lt(releaseVersion,readJSON(current).version))throw new Error('Cannot promote an older release')
  ensureStorage(dataRoot,path.join(root,'versions'));staging=fs.mkdtempSync(path.join(root,'stage-'))
  const identity=await work(staging),dest=path.join(root,'versions',releaseVersion)
  if(fs.existsSync(dest)){if(readJSON(safeFile(dataRoot,path.join(dest,'release.json'))).identity!==identity)throw new Error('Immutable release version already has different contents')}
  else{fs.writeFileSync(path.join(staging,'release.json'),JSON.stringify({version:releaseVersion,identity}));fs.renameSync(staging,dest);staging=null}
  atomic(current,{version:releaseVersion});return {version:releaseVersion,identity}
 }finally{if(staging)fs.rmSync(staging,{recursive:true,force:true});fs.rmdirSync(lock)}
}
async function publishFull(config,selection,directory){
 const t=target(config,selection),file=path.join(directory,metadataName(t))
 if(fs.statSync(file).size>2*1024*1024)throw new Error('Metadata too large')
 const m=yaml.load(fs.readFileSync(file,'utf8'),{schema:yaml.JSON_SCHEMA});version(m?.version)
 if(!Array.isArray(m.files)||!m.files.length||m.files.length>16||m.packages)throw new Error('Unsupported full-update metadata')
 const root=path.join(t.root,'full')
 return transaction(config.dataDir,root,m.version,async staging=>{
  const files=[],seen=new Set()
  for(const f of m.files){
   const name=basename(decodeURIComponent(f.url)),suffix=t.platform==='win32'?'.exe':'.deb'
   if(!name.endsWith(suffix)||seen.has(name)||typeof f.sha512!=='string'||Buffer.from(f.sha512,'base64').length!==64)throw new Error('Invalid full artifact metadata')
   seen.add(name);const source=path.join(directory,name),dest=path.join(staging,name)
   const actual=await copyChecked(source,dest,{sha512:f.sha512,size:f.size})
   const fd=fs.openSync(dest,'r'),magic=Buffer.alloc(8);try{fs.readSync(fd,magic)}finally{fs.closeSync(fd)}
   if(t.platform==='win32'?magic.subarray(0,2).toString()!=='MZ':magic.toString()!=='!<arch>\n')throw new Error('Wrong full artifact format')
   files.push({name,...actual})
   if(fs.existsSync(source+'.blockmap')){const block=await copyChecked(source+'.blockmap',dest+'.blockmap',{});files.push({name:name+'.blockmap',...block})}
  }
  if(m.sha512&&m.sha512!==m.files[0].sha512)throw new Error('Top-level checksum mismatch')
  const metadata={...m,files:m.files.map(f=>({...f,url:'versions/'+m.version+'/'+encodeURIComponent(decodeURIComponent(f.url))})),path:'versions/'+m.version+'/'+encodeURIComponent(decodeURIComponent(m.files[0].url)),sha512:m.files[0].sha512}
  const body=yaml.dump(metadata,{noRefs:true,lineWidth:-1});fs.writeFileSync(path.join(staging,metadataName(t)),body)
  return crypto.createHash('sha256').update(JSON.stringify([body,files])).digest('hex')
 })
}
async function publishResources(config,selection,directory){
 const t=target(config,selection),file=path.join(directory,'manifest.json')
 if(fs.statSync(file).size>2*1024*1024)throw new Error('Resource manifest too large')
 const m=verify(readJSON(file),t),root=path.join(t.root,'resources',m.runtimeId)
 return transaction(config.dataDir,root,m.version,async staging=>{
  const names=new Map([m,...(m.schemaVersion===2?[m.fallback]:[])].map(a=>[a.archive,a.sha256]))
  ensureStorage(config.dataDir,path.join(root,'archives'))
  for(const [name,sha256] of names){
   const actual=await copyChecked(path.join(directory,name),path.join(staging,name),{sha256})
   if(actual.size>50*1024*1024)throw new Error('Resource archive too large')
   const stored=path.join(root,'archives',name)
   if(fs.existsSync(stored)){if((await digest(safeFile(config.dataDir,stored))).sha256!==sha256)throw new Error('Immutable resource archive conflict')}
   else fs.renameSync(path.join(staging,name),stored)
   fs.rmSync(path.join(staging,name),{force:true})
  }
  fs.writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(m,null,2)+'\n')
  return crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex')
 })
}
module.exports={publishFull,publishResources,digest,atomic}
