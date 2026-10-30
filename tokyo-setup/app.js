import { slotKeys, changeSlotTimes, orderForSlot, equipmentGroup, sameReservationEquipment, oppositeBenchOverlaps, findOverlap, uncoveredIntervals, visibleAnchor } from './slot-order.mjs?v=20261028-both-benches';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, collection, doc, updateDoc, setDoc, onSnapshot, serverTimestamp, runTransaction, getDocsFromServer, arrayUnion, query, where, Timestamp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const firebaseApp=initializeApp({apiKey:'AIzaSyDKtcJIVPzK5aQe0IpjqQYcAij0F9vSn-M',authDomain:'lab-bench-tokyo-8402.firebaseapp.com',projectId:'lab-bench-tokyo-8402',appId:'1:887270247456:web:e2455b8ed986e0351a0045'});
const auth=getAuth(firebaseApp),db=getFirestore(firebaseApp),requestsRef=collection(db,'v2Requests');


let sharedRequests=[],unsubscribe=null,unsubscribeProfile=null,unsubscribeMember=null,unsubscribeAdmin=null,unsubscribeHistory=null,unsubscribeRoles=null,unsubscribeEquipment=null,profileName='',profileReady=false,editingId=null,adminMode=false,adminUids=[],memberEntries=[],equipmentStates={},equipmentReady=false;
const authStatus=document.querySelector('#authStatus'),protectedContent=document.querySelector('#protectedContent'),signInButton=document.querySelector('#signIn'),signOutButton=document.querySelector('#signOut');
signInButton.onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){authStatus.textContent='ログインできませんでした：'+e.code}};
signOutButton.onclick=()=>signOut(auth);
function jstDate(d=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
const dateKey=day=>Number(day.replaceAll('-',''));
const activeQuery=()=>query(requestsRef,where('dayKey','>=',dateKey(jstDate())));
function stopSubscriptions(){for(const f of [unsubscribe,unsubscribeProfile,unsubscribeMember,unsubscribeAdmin,unsubscribeHistory,unsubscribeRoles,unsubscribeEquipment])if(f)f();unsubscribe=unsubscribeProfile=unsubscribeMember=unsubscribeAdmin=unsubscribeHistory=unsubscribeRoles=unsubscribeEquipment=null;adminMode=false;adminUids=[];memberEntries=[];equipmentStates={};equipmentReady=false}
function startAccess(user){
 if(unsubscribe||unsubscribeProfile)return;
 document.querySelector('#applyPanel').hidden=true;
 unsubscribeProfile=onSnapshot(doc(db,'v2Profiles',user.uid),snapshot=>{profileName=snapshot.exists()?(snapshot.data().displayName||''):'';profileReady=true;renderProfile();render();if(detail.open&&selected)showDetailContent()},()=>{profileReady=false;authStatus.textContent='表示名を取得できませんでした。'});
 unsubscribe=onSnapshot(activeQuery(),snapshot=>{sharedRequests=snapshot.docs.map(d=>({...d.data(),id:d.id,created:d.data().createdAt?.toMillis()??Number.MAX_SAFE_INTEGER}));authStatus.textContent='検証版に接続しました。仮データのみ入力してください。';protectedContent.hidden=false;render();if(detail.open&&selected)showDetailContent()},error=>{protectedContent.hidden=true;authStatus.textContent='データを取得できませんでした：'+error.code});
 if(!unsubscribeEquipment)unsubscribeEquipment=onSnapshot(collection(db,'v2Equipment'),snapshot=>{equipmentStates=Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()]));equipmentReady=true;render();refreshEquipmentAdmin();},()=>{equipmentReady=false;authStatus.textContent='設備の状態を取得できませんでした。登録はできません。'});
 syncAdmin();
}
function syncAdmin(){
 if(adminMode){if(!unsubscribeAdmin)startAdmin();renderMembers();return}
 if(unsubscribeAdmin){unsubscribeAdmin();unsubscribeAdmin=null}if(unsubscribeHistory){unsubscribeHistory();unsubscribeHistory=null}
 memberEntries=[];document.querySelector('#memberList').replaceChildren();document.querySelector('#historyList').replaceChildren();document.querySelector('#equipmentAdmin').replaceChildren();document.querySelector('#adminPanel').hidden=true;
}
function watchRoles(user){
 if(unsubscribeRoles)return;
 unsubscribeRoles=onSnapshot(doc(db,'v2Admin','registry'),snapshot=>{
   adminUids=snapshot.exists()?snapshot.data().uids||[]:[];adminMode=adminUids.includes(user.uid);
   if(!snapshot.exists()){authStatus.textContent='管理者設定が見つかりません。管理者にお問い合わせください。';return}
   startAccess(user);syncAdmin();
 },()=>{adminMode=false;syncAdmin();protectedContent.hidden=true;authStatus.textContent='権限を確認できませんでした。'});
}
function renderMembers(){
 const box=document.querySelector('#memberList');box.replaceChildren();
 for(const entry of memberEntries){const member=entry.data(),isAdmin=adminUids.includes(entry.id),row=document.createElement('div');row.className='person';
   const title=document.createElement('div');title.textContent=`${member.name}（${member.email}） 状態：${member.status}${isAdmin?' · 管理者':''}`;row.append(title);
   for(const [label,status] of [['承認','approved'],['利用停止','suspended']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=member.status===status||(status==='suspended'&&isAdmin);button.onclick=async()=>{if(!confirm(`${member.name} さんを「${label}」にしますか？`))return;try{await updateDoc(entry.ref,{status,updatedAt:serverTimestamp()})}catch(e){alert('更新できませんでした：'+(e.code||e.message))}};row.append(button,document.createTextNode('　'))}
   if(member.status==='approved'){
     const button=document.createElement('button');button.type='button';button.textContent=isAdmin?'管理者を解除':'管理者にする';button.disabled=isAdmin&&adminUids.length===1;
     button.onclick=async()=>{if(!confirm(`${member.name} さんの管理者権限を${isAdmin?'解除':'付与'}しますか？`))return;try{
       await runTransaction(db,async tx=>{const ref=doc(db,'v2Admin','registry'),snap=await tx.get(ref);if(!snap.exists())throw new Error('管理者設定がありません。');const ids=snap.data().uids;if(isAdmin&&!ids.includes(entry.id)||!isAdmin&&ids.includes(entry.id))throw new Error('管理者の状態が変わりました。画面を確認してください。');const next=isAdmin?ids.filter(x=>x!==entry.id):[...ids,entry.id];if(!next.length)throw new Error('最後の管理者は解除できません。');tx.update(ref,{uids:next,changedUid:entry.id,updatedAt:serverTimestamp()})});
     }catch(e){alert('管理者権限を変更できませんでした：'+(e.message||e.code))}};row.append(button);
   }
   box.append(row);
 }
}
function startAdmin(){
 document.querySelector('#adminPanel').hidden=false;
 refreshEquipmentAdmin();
 unsubscribeAdmin=onSnapshot(collection(db,'v2Members'),snapshot=>{
   memberEntries=snapshot.docs;renderMembers();
 },()=>{document.querySelector('#memberList').textContent='申請一覧を読み込めませんでした。'});
}
onAuthStateChanged(auth,user=>{
 stopSubscriptions();profileName='';profileReady=false;renderProfile();sharedRequests=[];protectedContent.hidden=true;document.querySelector('#applyPanel').hidden=true;document.querySelector('#adminPanel').hidden=true;signInButton.hidden=!!user;signOutButton.hidden=!user;
 if(!user){authStatus.textContent='検証版にはGoogleログインが必要です。';return}
 unsubscribeMember=onSnapshot(doc(db,'v2Members',user.uid),snapshot=>{
   const status=snapshot.exists()?snapshot.data().status:null;
   if(status==='approved'){watchRoles(user);return}
   if(unsubscribeRoles){unsubscribeRoles();unsubscribeRoles=null}adminMode=false;adminUids=[];syncAdmin();
   if(unsubscribe){unsubscribe();unsubscribe=null}if(unsubscribeProfile){unsubscribeProfile();unsubscribeProfile=null}sharedRequests=[];profileReady=false;protectedContent.hidden=true;
   if(unsubscribeEquipment){unsubscribeEquipment();unsubscribeEquipment=null}equipmentStates={};equipmentReady=false;
   authStatus.textContent=status==='pending'?'利用申請は承認待ちです。':status==='suspended'?'利用は停止されています。管理者にお問い合わせください。':'利用申請が必要です。';
   document.querySelector('#applyPanel').hidden=status!==null;
 },error=>{authStatus.textContent='申請状況を確認できませんでした：'+error.code});
});
document.querySelector('#applyForm').onsubmit=async e=>{e.preventDefault();const user=auth.currentUser,name=document.querySelector('#applyName').value.trim();if(!user||!name)return;try{await setDoc(doc(db,'v2Members',user.uid),{status:'pending',email:user.email,name,requestedAt:serverTimestamp()});document.querySelector('#applyError').textContent=''}catch(e){document.querySelector('#applyError').textContent='申請できませんでした：'+(e.code||e.message)}};
document.querySelector('#loadHistory').onclick=()=>{
 if(unsubscribeHistory){unsubscribeHistory();unsubscribeHistory=null;document.querySelector('#historyList').replaceChildren();return}
 unsubscribeHistory=onSnapshot(query(requestsRef,where('dayKey','<',dateKey(jstDate()))),snapshot=>{const box=document.querySelector('#historyList');box.replaceChildren();for(const entry of snapshot.docs){const r=entry.data(),row=document.createElement('div');row.className='person';row.textContent=`${r.date} ${r.start}〜${r.end} ${r.name} ${equipmentNames[r.equipment]||r.equipment} ${r.cancelled?'取消済み':''} ${r.activity||''} ${r.memo||''} ${r.reason||''}`;box.append(row)}if(!snapshot.size)box.textContent='過去の記録はありません。'},()=>{document.querySelector('#historyList').textContent='履歴を読み込めませんでした。'});
};
let subscribedDay=jstDate();setInterval(()=>{if(jstDate()===subscribedDay)return;subscribedDay=jstDate();if(unsubscribe){unsubscribe();unsubscribe=null}if(unsubscribeHistory){unsubscribeHistory();unsubscribeHistory=null;document.querySelector('#historyList').replaceChildren()}if(auth.currentUser&&profileReady){if(unsubscribeProfile){unsubscribeProfile();unsubscribeProfile=null}startAccess(auth.currentUser)}},30000);

const dateInput=document.querySelector('#date');
const cards=document.querySelector('#cards');
const detail=document.querySelector('#detail');
const formDialog=document.querySelector('#formDialog');
const form=document.querySelector('#form');
let selected=null;
let view='week';
const nameKey='bench-demo-display-name';
const nameDialog=document.querySelector('#nameDialog');
const nameForm=document.querySelector('#nameForm');
let pendingForm=null;
function displayName(){return profileName.trim()}
function renderProfile(){const n=displayName();document.querySelector('#profileText').textContent=n?'表示名：'+n:'表示名：未設定';document.querySelector('#changeName').textContent=n?'変更':'表示名を設定'}
function askName(){nameForm.elements.displayName.value=displayName();document.querySelector('#nameError').textContent='';nameDialog.showModal()}
document.querySelector('#changeName').onclick=()=>{pendingForm=null;askName()};
nameForm.onsubmit=async e=>{e.preventDefault();const name=nameForm.elements.displayName.value.trim();if(!name){document.querySelector('#nameError').textContent='表示名を入力してください。';return}try{await setDoc(doc(db,'v2Profiles',auth.currentUser.uid),{displayName:name,updatedAt:serverTimestamp()});profileName=name;renderProfile();nameDialog.close();if(pendingForm){const p=pendingForm;pendingForm=null;openForm(p.group,p.n,p.day)}}catch(e){document.querySelector('#nameError').textContent='表示名を保存できませんでした：'+e.code}};
renderProfile();
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const escapeHTML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=()=>sharedRequests.filter(x=>!x.cancelled);
const equipmentNames={either:'どちらでもよい',one:'①を希望',two:'②を希望',three:'クリーンベンチ③',cabinet:'安全キャビネット'};
const groups=[{id:'culture',title:'細胞培養用 ①・②',desc:'どちらでもよい・台を指定した希望をまとめて表示',items:['either','one','two']},{id:'three',title:'クリーンベンチ③',desc:'用途限定 · 真空ポンプが不足しています',items:['three']},{id:'cabinet',title:'安全キャビネット',desc:'現在は大腸菌操作用 · 利用条件は管理者に確認',items:['cabinet']}];
const equipmentLabels={one:'クリーンベンチ①',two:'クリーンベンチ②',three:'クリーンベンチ③',cabinet:'安全キャビネット'};
const statusLabels={normal:'通常',notice:'注意あり',unavailable:'利用不可'};
function allowedEquipment(equipment){
 const available=id=>equipmentStates[id]?.status!=='unavailable';
 if(equipment==='either')return available('one')||available('two');
 if(equipment==='both')return available('one')&&available('two');
 return available(equipment);
}
function refreshEquipmentAdmin(){
 if(!adminMode)return;
 const box=document.querySelector('#equipmentAdmin');
 if(!box.children.length){
   for(const [id,label] of Object.entries(equipmentLabels)){
     const form=document.createElement('form');form.className='equipment-form';form.dataset.equipment=id;
     form.innerHTML=`<strong></strong><p class="equipment-current"></p><label>状態<select name="status"><option value="normal">通常</option><option value="notice">注意あり</option><option value="unavailable">利用不可</option></select></label><label>注意書き・理由<textarea name="notice" rows="2" maxlength="200"></textarea></label><button type="submit" class="sub">状態を保存</button><span class="equipment-error" role="alert"></span>`;
     form.querySelector('strong').textContent=label;
     form.elements.status.value=equipmentStates[id]?.status||'normal';form.elements.notice.value=equipmentStates[id]?.notice||'';
     form.addEventListener('input',()=>{form.dataset.dirty='true'});
     form.onsubmit=async e=>{e.preventDefault();const status=form.elements.status.value,notice=status==='normal'?'':form.elements.notice.value.trim(),err=form.querySelector('.equipment-error');
       if(status!=='normal'&&!notice){err.textContent='注意書きまたは利用不可の理由を入力してください。';return}
       if(!confirm(`${label}を「${statusLabels[status]}」に変更しますか？設定はすぐに有効になります。`))return;
       try{await setDoc(doc(db,'v2Equipment',id),{status,notice,updatedAt:serverTimestamp()});form.dataset.dirty='';err.textContent='保存しました。'}catch(e){err.textContent='保存できませんでした：'+(e.code||e.message)}
     };box.append(form);
   }
 }
 for(const form of box.querySelectorAll('form')){const state=equipmentStates[form.dataset.equipment]||{status:'normal',notice:''};form.querySelector('.equipment-current').textContent=`現在：${statusLabels[state.status]||state.status}${state.notice?' — '+state.notice:''}`;if(!form.dataset.dirty){form.elements.status.value=state.status;form.elements.notice.value=state.notice||''}}
}
function showEquipmentStatus(card,group){
 const ids=group.id==='culture'?['one','two']:[group.id];
 const entries=ids.map(id=>({id,state:equipmentStates[id]})).filter(x=>x.state&&x.state.status!=='normal');
 for(const {id,state} of entries){const p=document.createElement('p');p.className='equipment-status '+(state.status==='unavailable'?'unavailable':'warning');p.textContent=`${equipmentLabels[id]}：${statusLabels[state.status]} — ${state.notice}`;card.append(p)}
}
dateInput.value=jstDate();
function requests(group,slot,day=dateInput.value){return get().filter(x=>x.date===day&&group.items.includes(x.equipment)&&minutes(x.start)<slot+30&&minutes(x.end)>slot).sort((a,b)=>{const av=orderForSlot(a,slot)?.toMillis?.()??Number.MAX_SAFE_INTEGER;const bv=orderForSlot(b,slot)?.toMillis?.()??Number.MAX_SAFE_INTEGER;return av-bv || a.id.localeCompare(b.id)})}
function getDays(){const d=new Date(dateInput.value+'T12:00:00');return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return x})}
function addTableNavigation(card){
 const nav=document.createElement('div');nav.className='table-nav';nav.setAttribute('aria-label','表の日付を移動');
 const prev=document.createElement('button'),next=document.createElement('button'),today=document.createElement('button'),range=document.createElement('span');
 prev.type=next.type=today.type='button';prev.textContent=view==='week'?'‹ 前の週':'‹ 前の日';next.textContent=view==='week'?'次の週 ›':'次の日 ›';today.textContent='今日';
 const days=getDays();const label=d=>`${d.getMonth()+1}/${d.getDate()}`;range.textContent=view==='week'?`${label(days[0])}〜${label(days[6])}`:label(days[0]);
 prev.disabled=dateInput.value<=localDay(new Date());prev.onclick=()=>shiftTable(view==='week'?-7:-1);next.onclick=()=>shiftTable(view==='week'?7:1);today.onclick=()=>{dateInput.value=localDay(new Date());render()};
 nav.append(prev,range,next,today);card.append(nav);
}
function shiftTable(days){const d=new Date(dateInput.value+'T12:00:00');d.setDate(d.getDate()+days);const target=localDay(d),today=localDay(new Date());dateInput.value=target<today?today:target;render()}
function slotButton(group,n,day,compact=false){const list=requests(group,n,day);const count=new Set(list.map(x=>x.ownerUid)).size;const fixed=list.some(x=>x.fixed&&minutes(x.fixedTime)>=n&&minutes(x.fixedTime)<n+30);const mine=!!auth.currentUser&&list.some(x=>x.ownerUid===auth.currentUser.uid);const button=document.createElement('button');button.className='slot '+(count>=3?'full':count?'busy':'')+(mine?' mine':'');button.innerHTML=compact?`<span>${count?count+'人':'−'}</span>${fixed?' <span class="flag">⚑</span>':''}`:`<strong>${time(n)}〜</strong><span>${count?'希望 '+count+'人':'希望なし'}</span>${fixed?' <span class="flag">⚑</span>':''}`;button.setAttribute('aria-label',`${day} ${time(n)} ${count}人${fixed?' 時刻指定あり':''}${mine?' 自分の希望あり':''}`);button.onclick=()=>showDetail(group,n,day);return button}
function render(){cards.innerHTML='';document.querySelector('#viewHelp').textContent=view==='week'?'選択日から７日間を表示します。横にスクロールし、枠を押すと詳細を確認できます。':'30分ごとの希望人数を表示します。枠を押すと詳細を確認できます。';for(const group of groups){const card=document.createElement('section');card.className='card';card.innerHTML=`<h3>${group.title}</h3><p>${group.desc}</p>`;showEquipmentStatus(card,group);if(view==='day'){const slots=document.createElement('div');slots.className='slots';for(let n=480;n<1140;n+=30)slots.append(slotButton(group,n,dateInput.value));card.append(slots)}else{const container=document.createElement('div');container.className='week-scroll';const grid=document.createElement('div');grid.className='week-grid';const days=getDays();grid.append(document.createElement('div'));days.forEach(d=>{const head=document.createElement('div');head.className='week-head';head.textContent=`${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;grid.append(head)});for(let n=480;n<1140;n+=30){const label=document.createElement('div');label.className='week-time';label.textContent=time(n);grid.append(label);days.forEach(d=>grid.append(slotButton(group,n,localDay(d),true)))}container.append(grid);card.append(container)}addTableNavigation(card);cards.append(card)}}
function showDetail(group,n,day=dateInput.value){selected={group,n,day};document.querySelector('#detailTitle').textContent=`${day}　${time(n)}〜${time(n+30)}`;document.querySelector('#detailDesc').textContent=group.title+' · 利用希望の登録順';const list=requests(group,n,day);const target=document.querySelector('#detailList');target.innerHTML=list.length?list.map((x,i)=>`<div class="person"><strong>${i+1}番　${escapeHTML(x.ownerUid===auth.currentUser?.uid && profileReady && displayName()?displayName():x.name)}</strong>　${escapeHTML(equipmentNames[x.equipment])}${x.fixed?'　<span class="flag">⚑ '+escapeHTML(x.fixedTime)+'</span>':''}<small>${escapeHTML(x.start)}〜${escapeHTML(x.end)}${x.activity?' · '+escapeHTML(x.activity):''}${x.memo?' · '+escapeHTML(x.memo):''}${x.reason?' · 2時間以上の理由：'+escapeHTML(x.reason):''}</small>${x.ownerUid===auth.currentUser?.uid?`<button type="button" data-edit="${escapeHTML(x.id)}">時間を変更</button>　<button type="button" data-remove="${escapeHTML(x.id)}">この試作データを取り消す</button>`:''}</div>`).join(''):'<div class="empty">この時間帯の利用希望はありません。</div>';target.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const item=get().find(x=>x.id===b.dataset.edit);if(!item)return;detail.close();openEdit(item)});target.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(confirm('この希望を全時間帯から取り消しますか？')){try{await updateDoc(doc(db,'v2Requests',b.dataset.remove),{cancelled:true,cancelledAt:serverTimestamp()});showDetailContent()}catch(e){alert('取消できませんでした：'+e.code)}}});if(!detail.open)detail.showModal()}
function showDetailContent(){showDetail(selected.group,selected.n,selected.day)}
function filterEquipmentOptions(group){
 const allowed=group?.id==='culture'?['either','one','two','both']:group?.items;
 for(const option of form.elements.equipment.options){const hide=!!allowed&&!allowed.includes(option.value);option.hidden=hide;option.disabled=hide}
}
function openForm(group,n,day=dateInput.value){if(!profileReady){alert('表示名を確認しています。しばらくしてからお試しください。');return}if(!displayName()){pendingForm={group,n,day};askName();return}editingId=null;form.reset();filterEquipmentOptions(group);form.elements.equipment.disabled=false;form.elements.date.readOnly=false;document.querySelector('#formHeading').textContent='利用希望を追加';document.querySelector('#formSubmit').textContent='希望を登録';document.querySelector('#formName').textContent=displayName();form.elements.date.value=day;form.elements.start.value=time(n??600);form.elements.end.value=time((n??600)+30);form.elements.equipment.value=group?.items[0]||'either';document.querySelector('#error').textContent='';updateForm();formDialog.showModal()}
function openEdit(item){
 if(!profileReady||!displayName()){alert('表示名を先に設定してください。');return}
 editingId=item.id;form.reset();filterEquipmentOptions(null);form.elements.equipment.value=item.equipment;form.elements.equipment.disabled=true;form.elements.date.value=item.date;form.elements.date.readOnly=true;
 for(const k of ['start','end','activity','fixedTime','memo','reason'])form.elements[k].value=item[k]||'';
 form.elements.fixed.checked=!!item.fixed;document.querySelector('#formHeading').textContent='利用希望の時間を変更';document.querySelector('#formSubmit').textContent='変更を保存';document.querySelector('#formName').textContent=displayName();document.querySelector('#error').textContent='';updateForm();formDialog.showModal();
}
function updateForm(){
 const activity=form.elements.activity,selected=activity.value;
 if(!editingId&&form.elements.equipment.value!=='cabinet'&&['大腸菌操作','レンチウイルスベクター関連'].includes(selected))activity.value='';
 for(const option of activity.options){
   const cabinetOnly=['大腸菌操作','レンチウイルスベクター関連'].includes(option.value);
   const keepExisting=!!editingId&&option.value===selected;
   const hide=cabinetOnly&&form.elements.equipment.value!=='cabinet'&&!keepExisting;
   option.hidden=hide;option.disabled=hide;
 }
 const fixed=form.elements.fixed.checked;document.querySelector('#fixedLabel').hidden=!fixed;form.elements.fixedTime.required=fixed;const duration=minutes(form.elements.end.value)-minutes(form.elements.start.value);const long=duration>=120;document.querySelector('#reasonLabel').hidden=!long;form.elements.reason.required=long
}
form.addEventListener('input',updateForm);
form.elements.equipment.addEventListener('change',updateForm);
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const submit=document.querySelector('#formSubmit');
 const f=new FormData(form),start=f.get('start'),end=f.get('end'),err=document.querySelector('#error');
 if(minutes(end)<=minutes(start)||minutes(start)%30||minutes(end)%30){err.textContent='開始・終了を30分単位で指定し、終了を開始より後にしてください。';return}
 if(f.get('fixed')&&(minutes(f.get('fixedTime'))<minutes(start)||minutes(f.get('fixedTime'))>=minutes(end))){err.textContent='指定時刻は希望時間の範囲内にしてください。';return}
 if(!auth.currentUser){err.textContent='ログインしてから操作してください。';return}
 const uid=auth.currentUser.uid,day=form.elements.date.value,requestedBoth=form.elements.equipment.value==='both',equipment=requestedBoth?'one':form.elements.equipment.value,currentId=editingId;
 if(!equipmentReady){err.textContent='設備の状態を確認できません。しばらくしてからお試しください。';return}
 if(!allowedEquipment(form.elements.equipment.value)){err.textContent='選択した設備は現在利用不可のため、登録・変更できません。設備の状態をご確認ください。';return}
 const requestRef=currentId?doc(db,'v2Requests',currentId):doc(requestsRef);
 if(day<jstDate()){err.textContent='過去の日付には登録・変更できません。';return}
 const candidate={id:requestRef.id,ownerUid:uid,date:day,equipment,start,end};
 const dayStart=Timestamp.fromDate(new Date(day+'T00:00:00+09:00')),dayKey=dateKey(day);
 const userDayRef=doc(db,'v2UserDays',`${uid}_${day}_${equipmentGroup(equipment)}`);
 submit.disabled=true;err.textContent='';
 try{
   const before=await getDocsFromServer(activeQuery());
   const beforeItems=before.docs.map(d=>({...d.data(),id:d.id}));
   const bothSpans=requestedBoth?['one','two'].flatMap(bench=>uncoveredIntervals(beforeItems,{...candidate,equipment:bench}).map(span=>({...span,equipment:bench}))):null;
   const bothAdjusted=requestedBoth&&(['one','two'].some(bench=>{const spans=bothSpans.filter(span=>span.equipment===bench);return spans.length!==1||spans[0].start!==start||spans[0].end!==end}));
   if(bothAdjusted){
     const added=bothSpans.length?bothSpans.map(span=>`${equipmentNames[span.equipment]}　${span.start}〜${span.end}`).join('\n'):'追加される時間はありません';
     if(!confirm('ご自身の既存の希望と重なるため、次の時間だけ追加します。\n\n'+added+'\n\n既存の希望と順位は変わりません。この内容で登録しますか？\n「キャンセル」で入力画面に戻ります。'))return;
   }
   const opposite=oppositeBenchOverlaps(beforeItems,candidate);
   let bothReason='';
   if(requestedBoth||opposite.length){
     const answer=prompt((requestedBoth?'①と②を同時に希望します。':'同じ時間帯に'+equipmentNames[opposite[0].equipment]+'の希望があります。')+'\n両方を希望する理由を入力してください（他の利用者にも表示されます）。');
     if(answer===null)return;
     bothReason=answer.trim();if(!bothReason){err.textContent='①と②を同時に希望する理由を入力してください。';return}
   }
   const otherEquipment=beforeItems.filter(r=>r.id!==currentId&&!r.cancelled&&r.ownerUid===uid&&r.date===day&&!sameReservationEquipment(r.equipment,equipment)&&!opposite.some(x=>x.id===r.id)&&!(requestedBoth&&r.equipment==='two')&&minutes(r.start)<minutes(end)&&minutes(r.end)>minutes(start));
   if(otherEquipment.length&&!confirm('同じ時間帯に、別の設備の利用希望があります。\n'+otherEquipment.map(r=>`${equipmentNames[r.equipment]||r.equipment}　${r.start}〜${r.end}`).join('\n')+'\n\nこのまま'+(currentId?'変更':'登録')+'しますか？'))return;
   const legacyIds=before.docs.filter(d=>d.data().ownerUid===uid&&d.data().date===day&&equipmentGroup(d.data().equipment)===equipmentGroup(equipment)).map(d=>d.id);
   const outcome=await runTransaction(db,async tx=>{
     const index=await tx.get(userDayRef);
     const ids=[...new Set([...legacyIds,...(index.exists()?index.data().requestIds||[]:[]),...(currentId?[currentId]:[])])];
     const records=await Promise.all(ids.map(id=>tx.get(doc(db,'v2Requests',id))));
     const items=records.filter(d=>d.exists()).map(d=>({...d.data(),id:d.id}));
     if(requestedBoth){const latest=['one','two'].flatMap(bench=>uncoveredIntervals(items,{...candidate,equipment:bench}).map(span=>({...span,equipment:bench})));if(JSON.stringify(latest)!==JSON.stringify(bothSpans))throw new Error('希望の状況が変わりました。もう一度登録して内容を確認してください。')}
     if(!requestedBoth&&oppositeBenchOverlaps(items,candidate).length&&!bothReason)throw new Error('別端末で①または②の希望が追加されました。もう一度保存し、両方を希望する理由を入力してください。');
     const intervals=uncoveredIntervals(items,candidate);
     const memo=f.get('memo').trim();
     const payload={activity:f.get('activity'),fixed:!!f.get('fixed'),fixedTime:f.get('fixedTime'),memo:[memo,bothReason?'①と②を同時に希望する理由：'+bothReason:''].filter(Boolean).join('\n'),reason:f.get('reason').trim()};
     if(requestedBoth){
       const spans=['one','two'].flatMap(bench=>uncoveredIntervals(items,{...candidate,equipment:bench}).map(span=>({...span,equipment:bench})));
       if(!spans.length)return {kind:'covered',intervals:[]};
       const refs=spans.map(()=>doc(requestsRef));
       for(let i=0;i<spans.length;i++){
         const span=spans[i],hasFixed=payload.fixed&&minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end);
         tx.set(refs[i],{...payload,...span,fixed:hasFixed,fixedTime:hasFixed?payload.fixedTime:'',ownerUid:uid,name:displayName(),date:day,dayStart,dayKey,cancelled:false,createdAt:serverTimestamp()});
       }
       tx.set(userDayRef,{ownerUid:uid,date:day,group:equipmentGroup(equipment),requestIds:arrayUnion(...refs.map(ref=>ref.id)),updatedAt:serverTimestamp()},{merge:true});
       return {kind:'both',intervals:spans,fixedOmitted:payload.fixed&&!spans.some(span=>minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end))};
     }
     const adjusted=intervals.length!==1||intervals[0].start!==start||intervals[0].end!==end;
     if(currentId){
       const current=items.find(x=>x.id===currentId);
       if(!current||current.cancelled||current.ownerUid!==uid||current.date!==day||current.equipment!==equipment)throw new Error('対象の希望を変更できません。');
       if(findOverlap(items,{...candidate,start:current.start,end:current.end}))throw new Error('既存の希望同士が重複しているため、自動変更できません。先に不要な希望を取り消してください。');
       if(intervals.length===0)return {kind:'covered',intervals:[]};
       const refs=intervals.map((_,i)=>i===0?requestRef:doc(requestsRef));
       for(let i=0;i<intervals.length;i++){
         const span=intervals[i],hasFixed=payload.fixed&&minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end);
         const data={...payload,...span,fixed:hasFixed,fixedTime:hasFixed?payload.fixedTime:'',slotTimes:changeSlotTimes(current,span.start,span.end,serverTimestamp)};
         if(i===0)tx.update(refs[i],{...data,updatedAt:serverTimestamp()});
         else tx.set(refs[i],{...data,ownerUid:uid,name:current.name,equipment,date:day,dayStart,dayKey,cancelled:false,createdAt:serverTimestamp()});
       }
       tx.set(userDayRef,{ownerUid:uid,date:day,group:equipmentGroup(equipment),requestIds:arrayUnion(...refs.map(ref=>ref.id)),updatedAt:serverTimestamp()},{merge:true});
       return {kind:'edited',intervals,adjusted,fixedOmitted:payload.fixed&&!intervals.some(span=>minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end))};
     }
     if(intervals.length===0)return {kind:'covered',intervals:[],fixedOmitted:payload.fixed};
     const refs=intervals.map((_,i)=>i===0?requestRef:doc(requestsRef));
     for(let i=0;i<intervals.length;i++){
       const span=intervals[i],hasFixed=payload.fixed&&minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end);
       tx.set(refs[i],{...payload,...span,fixed:hasFixed,fixedTime:hasFixed?payload.fixedTime:'',ownerUid:uid,name:displayName(),equipment,date:day,dayStart,dayKey,cancelled:false,createdAt:serverTimestamp()});
     }
     tx.set(userDayRef,{ownerUid:uid,date:day,group:equipmentGroup(equipment),requestIds:arrayUnion(...refs.map(ref=>ref.id)),updatedAt:serverTimestamp()},{merge:true});
     return {kind:'added',intervals,adjusted,fixedOmitted:payload.fixed&&!intervals.some(span=>minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end))};
   });
   dateInput.value=visibleAnchor(dateInput.value,day,view);formDialog.close();render();
   if(outcome.kind==='both')alert('登録した時間：\n'+outcome.intervals.map(v=>equipmentNames[v.equipment]+'　'+v.start+'〜'+v.end).join('\n')+'\n既存の希望と重なる時間は追加していません。'+(outcome.fixedOmitted?' 指定時刻は新たな希望に含まれず、既存の希望には反映されません。':''));
   else if(outcome.kind==='covered')alert('指定された時間は、ご自身の別の利用希望ですべて登録済みです。新たな登録・変更はありません。'+(outcome.fixedOmitted?' 時刻指定は既存の希望には反映されません。':''));
   else if(outcome.adjusted||outcome.fixedOmitted)alert('重複する時間を除いて'+(outcome.kind==='edited'?'変更':'登録')+'しました：'+outcome.intervals.map(v=>v.start+'〜'+v.end).join('、')+(outcome.fixedOmitted?'。指定時刻は既存の希望に含まれるため、新たな時刻指定は反映されていません。':''));
 }catch(e){err.textContent=e.message||('保存できませんでした：'+e.code)}finally{submit.disabled=false}
});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelector('#detailAdd').onclick=()=>{const s=selected;detail.close();openForm(s.group,s.n,s.day)};document.querySelector('#new').onclick=()=>openForm();dateInput.onchange=render;document.querySelector('#today').onclick=()=>{dateInput.value=localDay(new Date());render()};function shift(days){const d=new Date(dateInput.value+'T12:00:00');d.setDate(d.getDate()+days);dateInput.value=localDay(d);render()}document.querySelector('#prev').onclick=()=>shift(view==='week'?-7:-1);document.querySelector('#next').onclick=()=>shift(view==='week'?7:1);for(const [id,mode] of [['weekView','week'],['dayView','day']])document.getElementById(id).onclick=()=>{view=mode;for(const [other,m] of [['weekView','week'],['dayView','day']]){const b=document.getElementById(other);b.classList.toggle('active',m===view);b.setAttribute('aria-pressed',String(m===view))}render()};render();


