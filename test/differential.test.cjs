const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http')
const {GenericDifferentialDownloader}=require('electron-updater/out/differentialDownloader/GenericDifferentialDownloader'),{Provider}=require('electron-updater/out/providers/Provider'),{NodeHttpExecutor}=require('builder-util/out/nodeHttpExecutor'),{CancellationToken}=require('builder-util-runtime')
const {fixture,full,target}=require('./fixtures.cjs'),{createApp}=require('../src/server.cjs'),{publishFull}=require('../src/publish.cjs')
test('pinned updater downloads real multipart differences without a full-download fallback',{timeout:30000},async()=>{
 const f=fixture();let server;const warnings=[],warning=w=>warnings.push(w);process.on('warning',warning);try{
  const old=crypto.randomBytes(128*1600);old.write('MZ');const next=Buffer.from(old)
  for(let i=1;i<1600;i+=2)crypto.randomFillSync(next,i*128,128)
  const a=full(f,'1.0.0',old),b=full(f,'1.0.1',next);await publishFull(f.config,target,a.dir);await publishFull(f.config,target,b.dir)
  server=http.createServer({maxHeaderSize:64*1024},createApp(f.config));const ranges=[];let plainArtifactRequests=0
  server.on('request',req=>{if(req.url.endsWith('.exe')){if(req.headers.range)ranges.push(req.headers.range);else plainArtifactRequests++}})
  server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/v1/win/win32/x64/latest/full/'
  const url=new URL('versions/1.0.1/'+encodeURIComponent(b.name),base),provider=new Provider({executor:new NodeHttpExecutor(),platform:'win32'})
  const maps=provider.getBlockMapFiles(url,'1.0.0','1.0.1')
  assert.equal(await (await fetch(maps[0])).text(),'map-1.0.0');assert.equal(await (await fetch(maps[1])).text(),'map-1.0.1')
  function blockmap(bytes){const sums=[];for(let i=0;i<1600;i++)sums.push(crypto.createHash('sha256').update(bytes.subarray(i*128,(i+1)*128)).digest('hex'));return {version:'2',files:[{name:'file',offset:0,sizes:Array(1600).fill(128),checksums:sums}]}}
  const output=path.join(f.root,'download.exe'),logger={info(){},warn(){},error(){}}
  const downloader=new GenericDifferentialDownloader({size:next.length,sha512:crypto.createHash('sha512').update(next).digest('base64')},new NodeHttpExecutor(),{oldFile:path.join(a.dir,a.name),newFile:output,newUrl:url,logger,isUseMultipleRangeRequest:true,cancellationToken:new CancellationToken(),requestHeaders:{'x-test-padding':'x'.repeat(20000)}})
  await downloader.download(blockmap(old),blockmap(next))
  assert.deepEqual(warnings,[],'Streaming parts must clean up response listeners');assert.deepEqual(fs.readFileSync(output),next);assert.equal(plainArtifactRequests,0);assert.ok(ranges.length>=2);assert.ok(Math.max(...ranges.map(r=>r.split(',').length))>=500)
 }finally{process.off('warning',warning);if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}f.close()}
})
