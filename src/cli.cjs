const path=require('node:path'),{loadConfig}=require('./config.cjs'),{serve}=require('./server.cjs'),{publishFull,publishResources}=require('./publish.cjs'),{initLocal,locations,installService}=require('./setup.cjs')
function argument(name,fallback){const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1]}
async function main(command=process.argv[2]){
 const configFile=argument('config',process.env.UPDATE_SERVER_CONFIG||locations().configFile)
 if(command==='init-local'){
  const parent=path.resolve(__dirname,'../..'),clients={}
  for(const [flag,id] of [['win-client','electron-vue-skeleton-win'],['uos-client','electron-vue-skeleton-uos']])clients[id]=path.resolve(argument(flag,path.join(parent,id)))
  return initLocal({clients,newDeployment:process.argv.includes('--new-deployment'),port:Number(argument('port',25565))})
 }
 if(command==='install-service')return installService(configFile)
 const config=loadConfig(configFile)
 if(command==='serve'){
  if(process.env.HOST)config.host=process.env.HOST
  if(!['127.0.0.1','::1','0.0.0.0'].includes(config.host))throw new Error('Invalid bind host')
  if(process.env.UPDATE_DATA_DIR)config.dataDir=path.resolve(process.env.UPDATE_DATA_DIR)
  const server=serve(config)
  server.on('error',error=>{console.error(error.code||error.message);process.exitCode=1})
  server.on('listening',()=>console.log(JSON.stringify({service:'electron-update-server',host:config.host,port:config.port})))
  let closing=false;function close(){if(closing)return;closing=true;server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()}
  process.on('SIGTERM',close);process.on('SIGINT',close);return
 }
 const target={project:argument('project'),platform:argument('platform'),arch:argument('arch'),channel:argument('channel','latest')},directory=argument('dir')
 if(!directory)throw new Error('Use publish-full|publish-resources --project ID --platform win32|linux --arch x64|arm64 --dir output [--config file]')
 if(command==='publish-full')return publishFull(config,target,path.resolve(directory))
 if(command==='publish-resources')return publishResources(config,target,path.resolve(directory))
 throw new Error('Commands: init-local, serve, publish-full, publish-resources, install-service')
}
if(require.main===module)main().then(value=>{if(value)console.log(JSON.stringify(value))}).catch(error=>{console.error(error.message);process.exitCode=1})
module.exports={main}
