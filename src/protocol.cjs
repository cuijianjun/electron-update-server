const crypto=require('node:crypto'),semver=require('semver')
const fields=['schemaVersion','version','platform','arch','runtimeId','sha256','archive']
function payload(m){return Buffer.from(JSON.stringify(Object.fromEntries([...fields,...(m.schemaVersion===2?['base','files','fallback']:[])].map(k=>[k,m[k]]))))}
function archive(a){return a&&/^[a-f0-9]{64}$/.test(a.sha256)&&new RegExp('^renderer(?:-delta)?-'+a.sha256+'\\.zip$').test(a.archive)}
function verify(m,t){
 if(!m||![1,2].includes(m.schemaVersion)||semver.valid(m.version)!==m.version||m.platform!==t.platform||m.arch!==t.arch||!/^[a-f0-9]{64}$/.test(m.runtimeId)||!archive(m))throw new Error('Invalid signed resource target or archive')
 if(m.schemaVersion===2){
  if(!m.base||!semver.valid(m.base.version)||!semver.lt(m.base.version,m.version)||!/^[a-f0-9]{64}$/.test(m.base.sha256)||!archive(m.fallback)||!Array.isArray(m.files)||!m.files.length||m.files.length>5000)throw new Error('Invalid resource delta manifest')
  let size=0,previous='';const seen=new Set()
  for(const f of m.files){
   if(typeof f.path!=='string'||f.path<=previous||f.path.length>512||f.path.toLowerCase()==='publisher-manifest.json'||f.path.includes('\\')||f.path.split('/').some(s=>!s||s==='.'||s==='..'||/[\x00-\x1f:<>"|?*]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))||seen.has(f.path.toLowerCase())||!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw new Error('Invalid resource inventory')
   previous=f.path;seen.add(f.path.toLowerCase());size+=f.size
  }
  if(size>100*1024*1024||!m.files.some(f=>f.path==='index.html'))throw new Error('Invalid resource entry/size')
 }
 if(typeof m.signature!=='string'||!crypto.verify(null,payload(m),t.publicKey,Buffer.from(m.signature,'base64')))throw new Error('Invalid resource signature')
 return m
}
module.exports={payload,verify}
