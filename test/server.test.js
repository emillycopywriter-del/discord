import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server, base, directory, a, b, outsider, meeting;
const controllers=[];
async function start(){
 server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',DATA_DIR:directory,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{
  let output='';server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/port (\d+)/);if(match)resolve(match[1]);});
  server.once('exit',code=>reject(new Error('Server exited '+code)));server.stderr.on('data',chunk=>reject(new Error(String(chunk))));
 });
 base='http://127.0.0.1:'+port;
}
async function stop(){if(server&&!server.killed){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}}
async function guest(tab,cookie){
 const response=await fetch(base+'/session',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({name:tab,tab})});
 const {id}=await response.json();cookie=response.headers.get('set-cookie').split(';')[0];
 const controller=new AbortController();controllers.push(controller);
 const res=await fetch(base+'/events?'+new URLSearchParams({tab,name:tab}),{headers:{cookie},signal:controller.signal});assert.equal(res.status,200);
 const reader=res.body.getReader(),events=[];let buffer='';
 (async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value);let index;while((index=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,index);buffer=buffer.slice(index+2);if(chunk.startsWith('event:')){const [event,data]=chunk.split('\n');events.push({event:event.slice(7),data:JSON.parse(data.slice(6))});}}}}catch{}})();
 const client={tab,id,cookie,events,controller};await wait(()=>events.some(e=>e.event==='ready'));return client;
}
async function api(client,action,extra={}){
 const res=await fetch(base+'/api',{method:'POST',headers:{'content-type':'application/json',cookie:client.cookie},body:JSON.stringify({id:client.id,action,room:'general',...extra})});return {status:res.status,data:await res.json()};
}
async function wait(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Event timeout');}
before(async()=>{directory=await mkdtemp(path.join(tmpdir(),'workcall-test-'));await start();a=await guest('alice');b=await guest('bob');outsider=await guest('outsider');});
after(async()=>{controllers.forEach(c=>c.abort());await stop();await rm(directory,{recursive:true,force:true});});

test('serves WorkCall and rejects API impersonation and foreign origins',async()=>{
 assert.equal((await fetch(base+'/health')).status,200);
 const forged={...outsider,id:a.id};assert.equal((await api(forged,'message',{text:'spoof'})).status,401);
 const res=await fetch(base+'/session',{method:'POST',headers:{origin:'https://foreign.example','content-type':'application/json'},body:'{}'});assert.equal(res.status,403);
});
test('delivers group messages and keeps individual chats private',async()=>{
 assert.equal((await api(a,'message',{text:'Olá, equipe!'})).status,200);
 await wait(()=>b.events.some(e=>e.event==='message'&&e.data.text==='Olá, equipe!'));
 const dm=(await api(a,'room',{kind:'dm',name:'Bob',members:[b.id]})).data;
 assert.equal((await api(outsider,'message',{room:dm.id,text:'private'})).status,403);
 await api(b,'message',{room:dm.id,text:'Só nós'});
 await wait(()=>a.events.some(e=>e.event==='message'&&e.data.text==='Só nós'));
 assert.equal(outsider.events.some(e=>e.event==='room'&&e.data.id===dm.id),false);
});
test('creates meetings and joins by code while hiding them from uninvited guests',async()=>{
 meeting=(await api(a,'create-meeting',{name:'Planejamento'})).data;assert.match(meeting.code,/^[A-F0-9]{10}$/);
 assert.equal((await api(b,'join',{room:meeting.id})).status,403);
 assert.equal((await api(b,'find-meeting',{code:'INVALID'})).status,404);
 const result=await api(b,'find-meeting',{code:meeting.code.toLowerCase()});assert.equal(result.data.room.id,meeting.id);
 assert.equal(outsider.events.some(e=>e.event==='room'&&e.data.id===meeting.id),false);
 await api(a,'join',{room:meeting.id,mic:true,camera:true});await api(b,'join',{room:meeting.id,mic:true,camera:true});
});
test('allows exactly one concurrent presenter without changing camera or microphone state',async()=>{
 const results=await Promise.all([api(a,'share-start',{room:meeting.id}),api(b,'share-start',{room:meeting.id})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const owner=results[0].status===200?a:b,other=owner===a?b:a;
 const usersEvent=a.events.filter(e=>e.event==='users').at(-1);
 assert.equal(usersEvent.data.find(u=>u.id===owner.id).camera,true);assert.equal(usersEvent.data.find(u=>u.id===other.id).mic,true);
 await api(owner,'share-stop',{room:meeting.id});assert.equal((await api(other,'share-start',{room:meeting.id})).status,200);
 await api(other,'leave',{room:meeting.id});assert.equal((await api(owner,'share-start',{room:meeting.id})).status,200);
 await api(owner,'share-stop',{room:meeting.id});await api(other,'join',{room:meeting.id,mic:true,camera:true});
});
test('releases the presentation when its owner disconnects and scopes signaling to the call',async()=>{
 await api(a,'share-start',{room:meeting.id});a.controller.abort();
 await wait(()=>b.events.some(e=>e.event==='sharing'&&e.data.room===meeting.id&&e.data.owner===null));
 // Wait for presence removal, which follows lock release on the server.
 await wait(()=>b.events.filter(e=>e.event==='users').at(-1).data.every(u=>u.id!==a.id));
 assert.equal((await api(b,'share-start',{room:meeting.id})).status,200);
 assert.equal((await api(b,'signal',{room:meeting.id,to:outsider.id,signal:{candidate:'test'}})).status,403);
});
test('restores meetings and signed guest identities after a server restart',async()=>{
 const previousId=b.id,previousCookie=b.cookie;
 controllers.forEach(c=>c.abort());await stop();await start();
 const restored=await guest('bob',previousCookie);assert.equal(restored.id,previousId);
 const ready=restored.events.find(e=>e.event==='ready').data;
 assert.equal(ready.rooms.find(r=>r.id===meeting.id).code,meeting.code);
 assert.equal((await api(restored,'join',{room:meeting.id})).data.owner,null);
 const persisted=JSON.parse(await readFile(path.join(directory,'state.json'),'utf8'));assert.ok(persisted.messages.some(m=>m.text==='Olá, equipe!'));
});
