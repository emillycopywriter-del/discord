const $=id=>document.getElementById(id);
const previewMode=location.protocol==='file:'||new URLSearchParams(location.search).get('preview')==='1';
const tabId=sessionStorage.workcallId ||= crypto.randomUUID();
let id=tabId;
let name=localStorage.workcallName||'',rooms=[],messages=[],users=[],current='general',source,mode='group',callRoom=null,stream,screenStream;
const peers=new Map(),pending=new Map();
const shares=new Map();
let iceServers=[{urls:'stun:stun.l.google.com:19302'}],connected=false,meetingMode='create',prejoinRoom=null,screenBusy=false;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
async function api(action,extra={}){
 if(previewMode){
  if(action==='create-meeting'){const room={id:crypto.randomUUID(),name:extra.name||'Reunião da equipe',kind:'meeting',members:[id],code:crypto.randomUUID().slice(0,8).toUpperCase()};rooms.push(room);renderRooms();return room;}
  if(action==='find-meeting'){const room=rooms.find(r=>r.kind==='meeting'&&(r.code===extra.code.toUpperCase()||r.id===extra.code));if(!room)throw new Error('Na prévia, use o código de uma reunião criada aqui.');return {room,messages:[]};}
  if(action==='message'){
   const message={id:crypto.randomUUID(),room:current,user:id,name,text:extra.text,time:Date.now()};
   messages.push(message);renderMessages();return message;
  }
  if(action==='room'){
   const members=[id,...(extra.members||[])];
   const existing=extra.kind==='dm'&&rooms.find(r=>r.kind==='dm'&&r.members.length===members.length&&members.every(member=>r.members.includes(member)));
   if(existing)return existing;
   const room={id:crypto.randomUUID(),name:extra.name,kind:extra.kind,members};rooms.push(room);renderRooms();return room;
  }
  throw new Error('Chamadas reais estão disponíveis ao executar o aplicativo com npm start.');
 }
 if(!connected)throw new Error('Aguarde a conexão com o WorkCall.');
 const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,room:current,...extra})});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Não foi possível concluir a ação.');return result;
}
function connectPreview(){
 name=name||'Você';
 rooms=[{id:'general',name:'geral',kind:'group',members:[]},{id:'design',name:'design',kind:'group',members:[]},{id:'ideas',name:'ideias-e-inspirações',kind:'group',members:[]},{id:'projects',name:'projetos',kind:'group',members:[]},{id:'demo-dm-ana',name:'Ana Costa',kind:'dm',members:[id,'demo-ana']},{id:'demo-dm-lucas',name:'Lucas Silva',kind:'dm',members:[id,'demo-lucas']}];
 users=[{id,name,call:null},{id:'demo-ana',name:'Ana Costa',call:null},{id:'demo-lucas',name:'Lucas Silva',call:null},{id:'demo-bea',name:'Beatriz Lima',call:null}];
 messages=[{id:'demo-1',room:'general',user:'demo-ana',name:'Ana Costa',text:'Oi, pessoal! Que bom ter vocês por aqui. Vamos criar algo incrível juntos? ✨',time:Date.now()-600000},{id:'demo-2',room:'general',user:'demo-lucas',name:'Lucas Silva',text:'Já deixei algumas referências no canal de design. Me contem o que acharam! 🎨',time:Date.now()-420000},{id:'demo-3',room:'demo-dm-ana',user:'demo-ana',name:'Ana Costa',text:'Essa é uma conversa individual de exemplo. Você pode experimentar enviar uma mensagem aqui.',time:Date.now()-300000}];
 $('my-name').textContent=name;$('my-avatar').textContent=name.slice(0,2).toUpperCase();
 $('connection').textContent='✧ Prévia interativa do design · pessoas e conversas ilustrativas · alterações não são salvas';
 $('connection').classList.add('preview-banner');
 selectRoom('general');renderUsers();
}
function avatar(label){const a=document.createElement('div');a.className='avatar';a.textContent=label.trim().slice(0,2).toUpperCase();return a;}
function roomName(r){if(r.kind==='dm'){const other=users.find(u=>r.members.includes(u.id)&&u.id!==id);return other?.name||r.name;}return r.name;}
function renderRooms(){for(const kind of ['group','dm','meeting']){const el=$(kind==='group'?'groups':kind==='dm'?'directs':'meetings');el.replaceChildren();for(const room of rooms.filter(r=>r.kind===kind&&r.name.toLowerCase().includes($('search').value.toLowerCase()))){const b=document.createElement('button');b.className='channel'+(room.id===current?' selected':'');const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent='#';if(kind==='meeting')symbol.textContent='◉';b.append(kind==='dm'?avatar(roomName(room)):symbol);const label=document.createElement('span');label.textContent=roomName(room);b.append(label);b.onclick=()=>selectRoom(room.id);el.append(b);}}}
function selectRoom(roomId){document.body.classList.remove('sidebar-open');$('sidebar-toggle').setAttribute('aria-expanded','false');current=roomId;const room=rooms.find(r=>r.id===current);if(!room)return;$('room-name').textContent=roomName(room);$('welcome-room').textContent=(room.kind==='group'?'# ':'')+roomName(room);$('message').placeholder='Conversar em '+(room.kind==='group'?'#':'')+roomName(room);$('room-description').textContent=room.kind==='meeting'?'Reunião · '+room.code:room.kind==='dm'?'Uma conversa só de vocês':'Onde todas as conversas começam';$('copy-invite').hidden=room.kind!=='meeting';renderRooms();renderMessages();}
function renderMessages(){const container=$('messages');container.replaceChildren();const selected=messages.filter(m=>m.room===current);if(!selected.length){const p=document.createElement('p');p.className='empty-message';p.textContent='O espaço é de vocês. Seja a primeira pessoa a dizer oi 👋';container.append(p);}for(const m of selected){const row=document.createElement('article');row.className='message';row.append(avatar(m.name));const body=document.createElement('div');body.className='message-body';const author=document.createElement('strong');author.textContent=m.name;const time=document.createElement('time');time.textContent=new Date(m.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});time.dateTime=new Date(m.time).toISOString();const text=document.createElement('p');text.textContent=m.text;body.append(author,time,text);row.append(body);container.append(row);}$('chat').scrollTop=$('chat').scrollHeight;}
function renderUsers(){const list=$('users');list.replaceChildren();$('member-count').textContent=users.length;$('online-count').textContent=users.length;for(const u of users){const b=document.createElement('button');b.className='user';b.append(avatar(u.name));const info=document.createElement('div'),label=document.createElement('strong'),status=document.createElement('small');label.textContent=u.name+(u.id===id?' (você)':'');status.textContent=u.call?'Em uma chamada':'Disponível para conversar';info.append(label,status);b.append(info);b.onclick=()=>{if(u.id!==id)createDM(u);};list.append(b);}renderRooms();syncPeers();}
async function connect(){
 source?.close();connected=false;
 try{
  const response=await fetch('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,tab:tabId})});
  if(!response.ok)throw new Error('Não foi possível entrar. Tente novamente.');
  id=(await response.json()).id;
  source=new EventSource('/events?'+new URLSearchParams({tab:tabId,name}));
  source.addEventListener('ready',async e=>{
   const data=JSON.parse(e.data);connected=true;rooms=data.rooms;messages=data.messages;users=data.users;iceServers=data.iceServers;
   selectRoom(rooms.some(r=>r.id===current)?current:'general');renderUsers();
   $('connection').textContent='● Conectado ao WorkCall · crie uma reunião e compartilhe o convite';
   const code=new URLSearchParams(location.search).get('meeting');
   if(code){history.replaceState({},'',location.pathname);await findMeeting(code);}
  });
  source.addEventListener('room',e=>{const room=JSON.parse(e.data);if(!rooms.some(r=>r.id===room.id))rooms.push(room);renderRooms();});
  source.addEventListener('message',e=>{const message=JSON.parse(e.data);if(!messages.some(m=>m.id===message.id))messages.push(message);if(message.room===current)renderMessages();});
  source.addEventListener('users',e=>{users=JSON.parse(e.data);renderUsers();});
  source.addEventListener('signal',e=>handleSignal(JSON.parse(e.data)).catch(()=>toast('Falha ao conectar mídia. Tente entrar novamente.')));
  source.addEventListener('left',e=>removePeer(JSON.parse(e.data).id));
  source.addEventListener('sharing',e=>{const data=JSON.parse(e.data);shares.set(data.room,data.owner);renderSharing();});
  source.onerror=()=>{connected=false;$('connection').textContent='Reconectando…';if(callRoom)leaveCall(false);};
  $('my-name').textContent=name;$('my-avatar').textContent=name.slice(0,2).toUpperCase();
 }catch(error){toast(error.message);}
}
$('identity-form').onsubmit=event=>{name=$('name-input').value.trim();if(!name){event.preventDefault();return;}localStorage.workcallName=name;if(previewMode)connectPreview();else connect();};
if(previewMode)connectPreview();else if(name)connect();else $('identity').showModal();
$('rename').onclick=()=>{if(callRoom)leaveCall();$('name-input').value=name;$('identity').showModal();};
$('composer').onsubmit=async e=>{e.preventDefault();const text=$('message').value.trim();if(!text)return;try{await api('message',{text});$('message').value='';}catch(e){toast(e.message);}};
$('emoji').onclick=()=>{$('message').value+=' 👋';$('message').focus();};$('search').oninput=renderRooms;
$('home').onclick=()=>selectRoom('general');$('members-toggle').onclick=()=>document.querySelector('.members').classList.toggle('show');
function openRoom(kind){mode=kind;$('dialog-title').textContent=kind==='dm'?'Nova mensagem direta':'Criar um grupo';$('group-label').hidden=kind==='dm';$('group-name').required=kind!=='dm';$('person-label').hidden=kind!=='dm';$('room-help').textContent=kind==='dm'?'Escolha uma pessoa conectada para conversar.':'Os grupos ficam disponíveis para todos nesta comunidade.';$('person').replaceChildren();for(const u of users.filter(u=>u.id!==id)){const option=document.createElement('option');option.value=u.id;option.textContent=u.name;$('person').append(option);}if(kind==='dm'&&!$('person').options.length){toast('Abra o WorkCall em outro navegador para encontrar alguém online.');return;}$('room-dialog').showModal();}
for(const el of ['add-group','rail-add','invite'])$(el).onclick=()=>openRoom('group');$('add-dm').onclick=()=>openRoom('dm');$('cancel-room').onclick=()=>$('room-dialog').close();
async function createDM(u){try{const r=await api('room',{kind:'dm',name:u.name,members:[u.id]});if(!rooms.some(x=>x.id===r.id))rooms.push(r);selectRoom(r.id);}catch(e){toast(e.message);}}
$('room-form').onsubmit=async e=>{e.preventDefault();if(mode==='dm'){const u=users.find(u=>u.id===$('person').value);if(u)await createDM(u);}else try{const r=await api('room',{kind:'group',name:$('group-name').value.trim()||'novo-grupo'});if(!rooms.some(x=>x.id===r.id))rooms.push(r);selectRoom(r.id);$('group-name').value='';}catch(e){toast(e.message);return;}$('room-dialog').close();};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();$('search').focus();}});

function openMeeting(mode){
 meetingMode=mode;$('meeting-title').textContent=mode==='create'?'Nova reunião':'Entrar em uma reunião';
 $('meeting-name-label').hidden=mode!=='create';$('meeting-code-label').hidden=mode==='create';
 $('meeting-name').required=mode==='create';$('meeting-code').required=mode!=='create';
 $('meeting-submit').textContent=mode==='create'?'Criar reunião':'Continuar';$('meeting-dialog').showModal();
}
for(const button of ['new-meeting','quick-create'])$(button).onclick=()=>openMeeting('create');
for(const button of ['join-meeting','quick-join'])$(button).onclick=()=>openMeeting('join');
$('cancel-meeting').onclick=()=>$('meeting-dialog').close();
async function findMeeting(value){
 try{
  let code=value.trim();try{code=new URL(code).searchParams.get('meeting')||code;}catch{}
  const data=await api('find-meeting',{code});
  if(!rooms.some(r=>r.id===data.room.id))rooms.push(data.room);
  for(const message of data.messages)if(!messages.some(m=>m.id===message.id))messages.push(message);
  $('meeting-dialog').close();selectRoom(data.room.id);openPrejoin(data.room.id);
 }catch(error){toast(error.message);}
}
$('meeting-form').onsubmit=async event=>{
 event.preventDefault();$('meeting-submit').disabled=true;
 try{
  if(meetingMode==='join'){await findMeeting($('meeting-code').value);return;}
  const room=await api('create-meeting',{name:$('meeting-name').value.trim()||'Reunião da equipe'});
  if(!rooms.some(r=>r.id===room.id))rooms.push(room);
  $('meeting-dialog').close();selectRoom(room.id);openPrejoin(room.id);
 }catch(error){toast(error.message);}finally{$('meeting-submit').disabled=false;}
};
function showInvite(){
 const room=rooms.find(r=>r.id===current);if(!room?.code)return;
 $('invite-code').value=room.code;
 $('invite-link').value=previewMode?'Prévia local · use o aplicativo publicado para convites':new URL('/?meeting='+room.code,location.origin).href;
 $('copy-link').disabled=previewMode;$('invite-dialog').showModal();
}
$('copy-invite').onclick=showInvite;$('close-invite').onclick=()=>$('invite-dialog').close();
$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);toast('Convite copiado! Envie para sua equipe.');}catch{$('invite-link').select();toast('Selecione e copie o link acima.');}};
function openPrejoin(roomId){
 if(previewMode){toast('A prévia mostra o design. As chamadas funcionam no WorkCall com servidor.');return;}
 if(callRoom){toast('Encerre a chamada atual antes de entrar em outra.');return;}
 prejoinRoom=roomId;$('prejoin-title').textContent=roomName(rooms.find(r=>r.id===roomId));
 $('prejoin-error').textContent='';$('prejoin-dialog').showModal();
}
$('call').onclick=()=>openPrejoin(current);$('cancel-prejoin').onclick=()=>$('prejoin-dialog').close();
$('prejoin-form').onsubmit=async event=>{
 event.preventDefault();$('join-confirm').disabled=true;
 try{await joinCall(prejoinRoom,$('prejoin-mic').checked,$('prejoin-camera').checked);$('prejoin-dialog').close();}
 catch(error){$('prejoin-error').textContent=error.message;}
 finally{$('join-confirm').disabled=false;}
};
function mediaError(error){
 if(error.name==='NotAllowedError')return 'Permita o acesso à câmera e ao microfone no navegador, ou desmarque as opções para entrar sem eles.';
 if(error.name==='NotFoundError')return 'Câmera ou microfone não encontrado. Desmarque o dispositivo indisponível para continuar.';
 return error.message||'Não foi possível acessar seus dispositivos.';
}
async function joinCall(roomId,audio,video){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Para usar câmera e microfone, abra o WorkCall por HTTPS.');
 try{
  stream=audio||video?await navigator.mediaDevices.getUserMedia({audio,video}):new MediaStream();
  callRoom=roomId;
  const data=await api('join',{room:roomId,mic:audio,camera:video});shares.set(roomId,data.owner);
  $('call-panel').hidden=false;document.body.classList.add('in-call');
  $('call-label').textContent=roomName(rooms.find(r=>r.id===roomId));$('call').disabled=true;
  tile(id,name+' (você)',stream,true);updateControls();renderSharing();syncPeers();
 }catch(error){
  const joined=callRoom;callRoom=null;stream?.getTracks().forEach(t=>t.stop());stream=null;
  if(joined)api('leave',{room:joined}).catch(()=>{});
  throw new Error(mediaError(error));
 }
}
function tile(peerId,label,media,muted=false){
 let element=document.getElementById('video-'+peerId);
 if(!element){
  element=document.createElement('div');element.id='video-'+peerId;element.className='video-tile';
  const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=muted;
  const placeholder=avatar(label);placeholder.classList.add('video-avatar');
  const caption=document.createElement('span');caption.textContent=label;
  element.append(video,placeholder,caption);$('videos').append(element);
 }
 element.querySelector('video').srcObject=media;element.querySelector('video').play().catch(()=>{});
 const remotePeer=peers.get(peerId);
 const enabled=peerId===id?stream?.getVideoTracks().some(t=>t.enabled):remotePeer?.pc.connectionState==='connected'&&users.find(u=>u.id===peerId)?.camera;
 const caption=element.querySelector('span');
 caption.textContent=label+(peerId!==id&&remotePeer?.pc.connectionState!=='connected'?' · Conectando':'');
 element.classList.toggle('camera-off',!enabled);
}
function removePeer(peerId){const peer=peers.get(peerId);clearTimeout(peer?.timeout);peer?.pc.close();peers.delete(peerId);pending.delete(peerId);document.getElementById('video-'+peerId)?.remove();renderSharing();}
function makePeer(peerId,offerer=false){
 if(peers.has(peerId))return peers.get(peerId);
 const pc=new RTCPeerConnection({iceServers});
 const audio=offerer?pc.addTransceiver('audio',{direction:'sendrecv'}):null;
 const camera=offerer?pc.addTransceiver('video',{direction:'sendrecv'}):null;
 const screen=offerer?pc.addTransceiver('video',{direction:'sendrecv'}):null;
 const peer={pc,audio,camera,screen,remote:new MediaStream(),presentation:new MediaStream()};peers.set(peerId,peer);

 tile(peerId,users.find(u=>u.id===peerId)?.name||'Participant',peer.remote);
 pc.onicecandidate=event=>{if(event.candidate&&callRoom)api('signal',{room:callRoom,to:peerId,signal:{candidate:event.candidate}}).catch(()=>{});};
 pc.ontrack=event=>{
  if(pc.getTransceivers().indexOf(event.transceiver)===2)peer.presentation.addTrack(event.track);
  else peer.remote.addTrack(event.track);
  tile(peerId,users.find(u=>u.id===peerId)?.name||'Participante',peer.remote);renderSharing();
 };
 peer.timeout=setTimeout(()=>{if(pc.connectionState!=='connected'&&callRoom)toast('A mídia ainda não conectou. Verifique a rede e a configuração TURN da hospedagem.');},20000);
 pc.onconnectionstatechange=()=>{
  if(pc.connectionState==='connected')clearTimeout(peer.timeout);
  tile(peerId,users.find(u=>u.id===peerId)?.name||'Participante',peer.remote);
  if(pc.connectionState==='failed')toast('Não foi possível conectar a mídia. Redes restritivas podem precisar de um servidor TURN.');
 };
 return peer;
}
async function setPeerTracks(peer){
 await Promise.all([
  peer.audio.sender.replaceTrack(stream?.getAudioTracks()[0]||null),
  peer.camera.sender.replaceTrack(stream?.getVideoTracks()[0]||null),
  peer.screen.sender.replaceTrack(screenStream?.getVideoTracks()[0]||null),
 ]);
}
async function syncPeers(){
 if(!callRoom||!stream)return;
 const others=users.filter(u=>u.call===callRoom&&u.id!==id);$('call-count').textContent=(others.length+1)+' participante(s)';
 for(const peerId of [...peers.keys()])if(!others.some(u=>u.id===peerId))removePeer(peerId);
 for(const [peerId,peer] of peers)tile(peerId,users.find(u=>u.id===peerId)?.name||'Participante',peer.remote);
 for(const user of others){
  if(peers.has(user.id)||id>user.id)continue;
  const peer=makePeer(user.id,true);
  try{await setPeerTracks(peer);await peer.pc.setLocalDescription(await peer.pc.createOffer());await api('signal',{room:callRoom,to:user.id,signal:{description:peer.pc.localDescription}});}
  catch{removePeer(user.id);toast('Falha ao iniciar conexão com um participante.');}
 }
}
async function handleSignal({from,signal}){
 if(!callRoom||!stream||!users.some(u=>u.id===from&&u.call===callRoom))return;
 const peer=makePeer(from),{pc}=peer;
 if(signal.description){
  await pc.setRemoteDescription(signal.description);
  for(const candidate of pending.get(from)||[])await pc.addIceCandidate(candidate);pending.delete(from);
  if(signal.description.type==='offer'){
   [peer.audio,peer.camera,peer.screen]=pc.getTransceivers();
   for(const transceiver of pc.getTransceivers())transceiver.direction='sendrecv';
   await setPeerTracks(peer);
   await pc.setLocalDescription(await pc.createAnswer());
   await api('signal',{room:callRoom,to:from,signal:{description:pc.localDescription}});
  }
 }else if(signal.candidate){
  if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);
  else{if(!pending.has(from))pending.set(from,[]);pending.get(from).push(signal.candidate);}
 }
}
function updateControls(){
 const audio=stream?.getAudioTracks()[0],video=stream?.getVideoTracks()[0];
 $('mic').textContent=audio?.enabled?'Microfone ligado':'Ligar microfone';
 $('camera').textContent=video?.enabled?'Câmera ligada':'Ligar câmera';
 $('mic').setAttribute('aria-pressed',String(!!audio?.enabled));$('camera').setAttribute('aria-pressed',String(!!video?.enabled));
 if(stream)tile(id,name+' (você)',stream,true);
}
async function publishMedia(){
 await api('media',{room:callRoom,mic:!!stream?.getAudioTracks()[0]?.enabled,camera:!!stream?.getVideoTracks()[0]?.enabled});
 updateControls();
}
async function toggleMedia(kind){
 if(!callRoom||!stream)return;
 const button=$(kind==='audio'?'mic':'camera');button.disabled=true;
 try{
  let track=stream.getTracks().find(t=>t.kind===kind);
  if(track&&track.readyState==='live')track.enabled=!track.enabled;
  else{
   const acquired=await navigator.mediaDevices.getUserMedia({audio:kind==='audio',video:kind==='video'});track=acquired.getTracks()[0];stream.addTrack(track);
   await Promise.all([...peers.values()].map(p=>(kind==='audio'?p.audio:p.camera)?.sender.replaceTrack(track)));
  }
  await publishMedia();
 }catch(error){toast(mediaError(error));}finally{button.disabled=false;}
}
$('mic').onclick=()=>toggleMedia('audio');$('camera').onclick=()=>toggleMedia('video');
function renderSharing(){
 const owner=shares.get(callRoom);const active=!!callRoom&&!!owner;
 $('presentation').hidden=!active;
 const video=$('presentation-video');
 const media=owner===id?screenStream:peers.get(owner)?.presentation;
 if(video.srcObject!==media){video.srcObject=media||null;video.play().catch(()=>{});}
 $('presentation-name').textContent=owner===id?'Você está apresentando':(users.find(u=>u.id===owner)?.name||'Participante')+' está apresentando';
 $('sharing-status').textContent=active?(owner===id?'Você está compartilhando. Sua câmera continua disponível.':'Aguarde a apresentação terminar para compartilhar sua tela.'):'Uma pessoa por vez pode apresentar. As câmeras continuam ligadas.';
 $('screen').textContent=owner===id?'Parar compartilhamento':'Compartilhar tela';
 $('screen').disabled=screenBusy||!!(owner&&owner!==id);
}
async function stopScreen(notify=true){
 const active=screenStream;screenStream=null;
 active?.getTracks().forEach(t=>{t.onended=null;t.stop();});
 await Promise.all([...peers.values()].map(p=>p.screen?.sender.replaceTrack(null)));
 if(shares.get(callRoom)===id)shares.set(callRoom,null);
 if(notify&&callRoom)try{await api('share-stop',{room:callRoom});}catch(error){toast(error.message);}
 renderSharing();
}
$('screen').onclick=async()=>{
 if(!callRoom||screenBusy)return;
 if(screenStream){await stopScreen();return;}
 if(!navigator.mediaDevices.getDisplayMedia){toast('Este navegador não permite compartilhar a tela. Use um navegador compatível no computador.');return;}
 const room=callRoom;screenBusy=true;renderSharing();let captured,claimed=false;
 try{
  captured=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
  if(room!==callRoom){captured.getTracks().forEach(t=>t.stop());return;}
  await api('share-start',{room});claimed=true;
  if(captured.getVideoTracks()[0].readyState!=='live'){await api('share-stop',{room});claimed=false;throw new Error('O compartilhamento foi interrompido. Tente novamente.');}
  screenStream=captured;shares.set(room,id);
  screenStream.getVideoTracks()[0].onended=()=>stopScreen();
  await Promise.all([...peers.values()].map(p=>p.screen?.sender.replaceTrack(screenStream.getVideoTracks()[0])));
 }catch(error){
  captured?.getTracks().forEach(t=>t.stop());screenStream=null;
  if(claimed)await stopScreen();
  if(error.name!=='NotAllowedError')toast(error.message||'Não foi possível compartilhar a tela.');
 }finally{screenBusy=false;renderSharing();}
};
async function leaveCall(notify=true){
 const old=callRoom;callRoom=null;
 for(const peerId of [...peers.keys()])removePeer(peerId);
 stream?.getTracks().forEach(t=>t.stop());screenStream?.getTracks().forEach(t=>{t.onended=null;t.stop();});
 stream=null;screenStream=null;screenBusy=false;$('videos').replaceChildren();
 $('presentation-video').srcObject=null;$('presentation').hidden=true;
 $('call-panel').hidden=true;document.body.classList.remove('in-call');$('call').disabled=false;updateControls();
 if(notify&&old)try{await api('leave',{room:old});}catch(error){toast(error.message);}
}
$('hangup').onclick=()=>leaveCall();
$('sidebar-toggle').onclick=()=>{const open=document.body.classList.toggle('sidebar-open');$('sidebar-toggle').setAttribute('aria-expanded',String(open));};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('sidebar-open');$('sidebar-toggle').setAttribute('aria-expanded','false');}});
