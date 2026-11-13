const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),semver=require('semver')
const slug=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)
function loadConfig(file){
 const c=JSON.parse(fs.readFileSync(file,'utf8'))
 if(!c||!['127.0.0.1','::1','0.0.0.0'].includes(c.host)||!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.dataDir!=='string'||!c.projects||Array.isArray(c.projects))throw new Error('Invalid server configuration')
 for(const [name,p] of Object.entries(c.projects)){
  if(!slug(name)||!p||!['win32','linux'].includes(p.platform)||!Array.isArray(p.arches)||!p.arches.length||p.arches.some(a=>!['x64','arm64'].includes(a))||!Array.isArray(p.channels)||!p.channels.length||p.channels.some(x=>!slug(x))||typeof p.publicKey!=='string'||p.publicKey.includes('PRIVATE KEY')||crypto.createPublicKey(p.publicKey).asymmetricKeyType!=='ed25519')throw new Error('Invalid project configuration: '+name)
 }
 return {...c,dataDir:path.resolve(path.dirname(file),c.dataDir)}
}
function target(config,t){
 const p=Object.hasOwn(config.projects,t.project)?config.projects[t.project]:null
 if(!p||p.platform!==t.platform||!p.arches.includes(t.arch)||!p.channels.includes(t.channel))throw new Error('Unknown update target')
 return {...t,publicKey:p.publicKey,root:path.join(config.dataDir,t.project,t.platform,t.arch,t.channel)}
}
function version(v){if(typeof v!=='string'||semver.valid(v)!==v||v.length>100)throw new Error('Invalid release version');return v}
function basename(name){if(typeof name!=='string'||!name||name.length>255||name.startsWith('.')||/[\\/\x00-\x1f:]/.test(name)||/[. ]$/.test(name))throw new Error('Invalid artifact name');return name}
function metadataName(t){return t.platform==='win32'?'latest.yml':t.arch==='arm64'?'latest-linux-arm64.yml':'latest-linux.yml'}
function safeFile(root,file){
 const base=fs.realpathSync(root),full=path.resolve(file)
 if(!full.startsWith(path.resolve(root)+path.sep))throw new Error('File outside storage')
 let cursor=path.resolve(root)
 for(const part of path.relative(cursor,full).split(path.sep)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())throw new Error('Storage symlinks are forbidden')}
 if(!fs.realpathSync(full).startsWith(base+path.sep)||!fs.statSync(full).isFile())throw new Error('Invalid stored file')
 return full
}
function ensureStorage(root,directory){
 root=path.resolve(root);directory=path.resolve(directory)
 if(directory!==root&&!directory.startsWith(root+path.sep))throw new Error('Directory outside storage')
 fs.mkdirSync(root,{recursive:true})
 let cursor=root
 for(const part of ['',...path.relative(root,directory).split(path.sep).filter(Boolean)]){
  cursor=path.join(cursor,part)
  if(fs.existsSync(cursor)){const stat=fs.lstatSync(cursor);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Storage directory symlink is forbidden')}
  else fs.mkdirSync(cursor)
 }
}
module.exports={ensureStorage,loadConfig,target,version,basename,metadataName,safeFile}
