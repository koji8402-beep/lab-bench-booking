import { slotKeys, changeSlotTimes, orderForSlot, equipmentGroup, findOverlap, uncoveredIntervals, visibleAnchor } from './slot-order.mjs?v=20261028-auto-trim';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, collection, doc, updateDoc, setDoc, onSnapshot, serverTimestamp, runTransaction, getDocsFromServer, arrayUnion } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const firebaseApp=initializeApp({apiKey:'AIzaSyDn9Z_IBRag_p0DXL_LBS4sBYA7kgDOWsU',authDomain:'lab-bench-booking-test.firebaseapp.com',projectId:'lab-bench-booking-test',appId:'1:1043490879666:web:c34ae106322a04127a71ab'});
const auth=getAuth(firebaseApp),db=getFirestore(firebaseApp),requestsRef=collection(db,'prototypeRequests');
let sharedRequests=[],unsubscribe=null,unsubscribeProfile=null,profileName='',profileReady=false,editingId=null;
const authStatus=document.querySelector('#authStatus'),protectedContent=document.querySelector('#protectedContent'),signInButton=document.querySelector('#signIn'),signOutButton=document.querySelector('#signOut');
signInButton.onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){authStatus.textContent='ログインできませんでした：'+e.code}};
signOutButton.onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{if(unsubscribe){unsubscribe();unsubscribe=null}if(unsubscribeProfile){unsubscribeProfile();unsubscribeProfile=null}profileName='';profileReady=false;renderProfile();sharedRequests=[];protectedContent.hidden=true;signInButton.hidden=!!user;signOutButton.hidden=!user;if(!user){authStatus.textContent='共有テストにはGoogleログインが必要です。';return}authStatus.textContent='利用権限を確認しています…';unsubscribeProfile=onSnapshot(doc(db,'prototypeProfiles',user.uid),snapshot=>{profileName=snapshot.exists()?(snapshot.data().displayName||''):'';profileReady=true;renderProfile();render();if(detail.open&&selected)showDetailContent()},()=>{profileReady=false;authStatus.textContent='表示名を取得できませんでした。'});unsubscribe=onSnapshot(requestsRef,snapshot=>{sharedRequests=snapshot.docs.map(d=>({...d.data(),id:d.id,created:d.data().createdAt?.toMillis()??Number.MAX_SAFE_INTEGER}));authStatus.textContent='共有テストに接続しました。仮データのみ入力してください。';protectedContent.hidden=false;render();if(detail.open&&selected)showDetailContent()},error=>{protectedContent.hidden=true;authStatus.textContent='このアカウントは利用できないか、接続に失敗しました：'+error.code})});
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
nameForm.onsubmit=async e=>{e.preventDefault();const name=nameForm.elements.displayName.value.trim();if(!name){document.querySelector('#nameError').textContent='表示名を入力してください。';return}try{await setDoc(doc(db,'prototypeProfiles',auth.currentUser.uid),{displayName:name,updatedAt:serverTimestamp()});profileName=name;renderProfile();nameDialog.close();if(pendingForm){const p=pendingForm;pendingForm=null;openForm(p.group,p.n,p.day)}}catch(e){document.querySelector('#nameError').textContent='表示名を保存できませんでした：'+e.code}};
renderProfile();
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const escapeHTML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=()=>sharedRequests.filter(x=>!x.cancelled);
const equipmentNames={either:'どちらでもよい',one:'①を希望',two:'②を希望',three:'クリーンベンチ③',cabinet:'安全キャビネット'};
const groups=[{id:'culture',title:'細胞培養用 ①・②',desc:'どちらでもよい・台を指定した希望をまとめて表示',items:['either','one','two']},{id:'three',title:'クリーンベンチ③',desc:'用途限定 · 真空ポンプが不足しています',items:['three']},{id:'cabinet',title:'安全キャビネット',desc:'現在は大腸菌操作用 · 利用条件は管理者に確認',items:['cabinet']}];
dateInput.value=localDay(new Date());
function requests(group,slot,day=dateInput.value){return get().filter(x=>x.date===day&&group.items.includes(x.equipment)&&minutes(x.start)<slot+30&&minutes(x.end)>slot).sort((a,b)=>{const av=orderForSlot(a,slot)?.toMillis?.()??Number.MAX_SAFE_INTEGER;const bv=orderForSlot(b,slot)?.toMillis?.()??Number.MAX_SAFE_INTEGER;return av-bv || a.id.localeCompare(b.id)})}
function getDays(){const d=new Date(dateInput.value+'T12:00:00');return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return x})}
function slotButton(group,n,day,compact=false){const list=requests(group,n,day);const fixed=list.some(x=>x.fixed&&minutes(x.fixedTime)>=n&&minutes(x.fixedTime)<n+30);const button=document.createElement('button');button.className='slot '+(list.length>=3?'full':list.length?'busy':'');button.innerHTML=compact?`<span>${list.length?list.length+'人':'−'}</span>${fixed?' <span class="flag">⚑</span>':''}`:`<strong>${time(n)}〜</strong><span>${list.length?'希望 '+list.length+'人':'希望なし'}</span>${fixed?' <span class="flag">⚑</span>':''}`;button.setAttribute('aria-label',`${day} ${time(n)} ${list.length}人${fixed?' 時刻指定あり':''}`);button.onclick=()=>showDetail(group,n,day);return button}
function render(){cards.innerHTML='';document.querySelector('#viewHelp').textContent=view==='week'?'選択日から７日間を表示します。横にスクロールし、枠を押すと詳細を確認できます。':'30分ごとの希望人数を表示します。枠を押すと詳細を確認できます。';for(const group of groups){const card=document.createElement('section');card.className='card';card.innerHTML=`<h3>${group.title}</h3><p>${group.desc}</p>`;if(view==='day'){const slots=document.createElement('div');slots.className='slots';for(let n=480;n<1140;n+=30)slots.append(slotButton(group,n,dateInput.value));card.append(slots)}else{const container=document.createElement('div');container.className='week-scroll';const grid=document.createElement('div');grid.className='week-grid';const days=getDays();grid.append(document.createElement('div'));days.forEach(d=>{const head=document.createElement('div');head.className='week-head';head.textContent=`${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;grid.append(head)});for(let n=480;n<1140;n+=30){const label=document.createElement('div');label.className='week-time';label.textContent=time(n);grid.append(label);days.forEach(d=>grid.append(slotButton(group,n,localDay(d),true)))}container.append(grid);card.append(container)}cards.append(card)}}
function showDetail(group,n,day=dateInput.value){selected={group,n,day};document.querySelector('#detailTitle').textContent=`${day}　${time(n)}〜${time(n+30)}`;document.querySelector('#detailDesc').textContent=group.title+' · 利用希望の登録順';const list=requests(group,n,day);const target=document.querySelector('#detailList');target.innerHTML=list.length?list.map((x,i)=>`<div class="person"><strong>${i+1}番　${escapeHTML(x.ownerUid===auth.currentUser?.uid && profileReady && displayName()?displayName():x.name)}</strong>　${escapeHTML(equipmentNames[x.equipment])}${x.fixed?'　<span class="flag">⚑ '+escapeHTML(x.fixedTime)+'</span>':''}<small>${escapeHTML(x.start)}〜${escapeHTML(x.end)}${x.activity?' · '+escapeHTML(x.activity):''}${x.memo?' · '+escapeHTML(x.memo):''}${x.reason?' · 2時間以上の理由：'+escapeHTML(x.reason):''}</small><button type="button" data-edit="${escapeHTML(x.id)}">時間を変更</button>　<button type="button" data-remove="${escapeHTML(x.id)}">この試作データを取り消す</button></div>`).join(''):'<div class="empty">この時間帯の利用希望はありません。</div>';target.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const item=get().find(x=>x.id===b.dataset.edit);if(!item)return;detail.close();openEdit(item)});target.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(confirm('この希望を全時間帯から取り消しますか？')){try{await updateDoc(doc(db,'prototypeRequests',b.dataset.remove),{cancelled:true,cancelledAt:serverTimestamp()});showDetailContent()}catch(e){alert('取消できませんでした：'+e.code)}}});if(!detail.open)detail.showModal()}
function showDetailContent(){showDetail(selected.group,selected.n,selected.day)}
function openForm(group,n,day=dateInput.value){if(!profileReady){alert('表示名を確認しています。しばらくしてからお試しください。');return}if(!displayName()){pendingForm={group,n,day};askName();return}editingId=null;form.reset();form.elements.equipment.disabled=false;form.elements.date.readOnly=false;document.querySelector('#formHeading').textContent='利用希望を追加';document.querySelector('#formSubmit').textContent='希望を登録';document.querySelector('#formName').textContent=displayName();form.elements.date.value=day;form.elements.start.value=time(n??600);form.elements.end.value=time((n??600)+30);form.elements.equipment.value=group?.items[0]||'either';document.querySelector('#error').textContent='';updateForm();formDialog.showModal()}
function openEdit(item){
 if(!profileReady||!displayName()){alert('表示名を先に設定してください。');return}
 editingId=item.id;form.reset();form.elements.equipment.value=item.equipment;form.elements.equipment.disabled=true;form.elements.date.value=item.date;form.elements.date.readOnly=true;
 for(const k of ['start','end','activity','fixedTime','memo','reason'])form.elements[k].value=item[k]||'';
 form.elements.fixed.checked=!!item.fixed;document.querySelector('#formHeading').textContent='利用希望の時間を変更';document.querySelector('#formSubmit').textContent='変更を保存';document.querySelector('#formName').textContent=displayName();document.querySelector('#error').textContent='';updateForm();formDialog.showModal();
}
function updateForm(){const fixed=form.elements.fixed.checked;document.querySelector('#fixedLabel').hidden=!fixed;form.elements.fixedTime.required=fixed;const duration=minutes(form.elements.end.value)-minutes(form.elements.start.value);const long=duration>=120;document.querySelector('#reasonLabel').hidden=!long;form.elements.reason.required=long}
form.addEventListener('input',updateForm);
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const submit=document.querySelector('#formSubmit');
 const f=new FormData(form),start=f.get('start'),end=f.get('end'),err=document.querySelector('#error');
 if(minutes(end)<=minutes(start)||minutes(start)%30||minutes(end)%30){err.textContent='開始・終了を30分単位で指定し、終了を開始より後にしてください。';return}
 if(f.get('fixed')&&(minutes(f.get('fixedTime'))<minutes(start)||minutes(f.get('fixedTime'))>=minutes(end))){err.textContent='指定時刻は希望時間の範囲内にしてください。';return}
 if(!auth.currentUser){err.textContent='ログインしてから操作してください。';return}
 const uid=auth.currentUser.uid,day=form.elements.date.value,equipment=form.elements.equipment.value,currentId=editingId;
 const requestRef=currentId?doc(db,'prototypeRequests',currentId):doc(requestsRef);
 const candidate={id:requestRef.id,ownerUid:uid,date:day,equipment,start,end};
 const userDayRef=doc(db,'prototypeUserDays',`${uid}_${day}_${equipmentGroup(equipment)}`);
 submit.disabled=true;err.textContent='';
 try{
   const before=await getDocsFromServer(requestsRef);
   const legacyIds=before.docs.filter(d=>d.data().ownerUid===uid&&d.data().date===day&&equipmentGroup(d.data().equipment)===equipmentGroup(equipment)).map(d=>d.id);
   const outcome=await runTransaction(db,async tx=>{
     const index=await tx.get(userDayRef);
     const ids=[...new Set([...legacyIds,...(index.exists()?index.data().requestIds||[]:[]),...(currentId?[currentId]:[])])];
     const records=await Promise.all(ids.map(id=>tx.get(doc(db,'prototypeRequests',id))));
     const items=records.filter(d=>d.exists()).map(d=>({...d.data(),id:d.id}));
     const intervals=uncoveredIntervals(items,candidate);
     const payload={activity:f.get('activity'),fixed:!!f.get('fixed'),fixedTime:f.get('fixedTime'),memo:f.get('memo').trim(),reason:f.get('reason').trim()};
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
         else tx.set(refs[i],{...data,ownerUid:uid,name:current.name,equipment,date:day,cancelled:false,createdAt:serverTimestamp()});
       }
       tx.set(userDayRef,{ownerUid:uid,date:day,group:equipmentGroup(equipment),requestIds:arrayUnion(...refs.map(ref=>ref.id)),updatedAt:serverTimestamp()},{merge:true});
       return {kind:'edited',intervals,adjusted,fixedOmitted:payload.fixed&&!intervals.some(span=>minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end))};
     }
     if(intervals.length===0)return {kind:'covered',intervals:[],fixedOmitted:payload.fixed};
     const refs=intervals.map((_,i)=>i===0?requestRef:doc(requestsRef));
     for(let i=0;i<intervals.length;i++){
       const span=intervals[i],hasFixed=payload.fixed&&minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end);
       tx.set(refs[i],{...payload,...span,fixed:hasFixed,fixedTime:hasFixed?payload.fixedTime:'',ownerUid:uid,name:displayName(),equipment,date:day,cancelled:false,createdAt:serverTimestamp()});
     }
     tx.set(userDayRef,{ownerUid:uid,date:day,group:equipmentGroup(equipment),requestIds:arrayUnion(...refs.map(ref=>ref.id)),updatedAt:serverTimestamp()},{merge:true});
     return {kind:'added',intervals,adjusted,fixedOmitted:payload.fixed&&!intervals.some(span=>minutes(payload.fixedTime)>=minutes(span.start)&&minutes(payload.fixedTime)<minutes(span.end))};
   });
   dateInput.value=visibleAnchor(dateInput.value,day,view);formDialog.close();render();
   if(outcome.kind==='covered')alert('指定された時間は、ご自身の別の利用希望ですべて登録済みです。新たな登録・変更はありません。'+(outcome.fixedOmitted?' 時刻指定は既存の希望には反映されません。':''));
   else if(outcome.adjusted||outcome.fixedOmitted)alert('重複する時間を除いて'+(outcome.kind==='edited'?'変更':'登録')+'しました：'+outcome.intervals.map(v=>v.start+'〜'+v.end).join('、')+(outcome.fixedOmitted?'。指定時刻は既存の希望に含まれるため、新たな時刻指定は反映されていません。':''));
 }catch(e){err.textContent=e.message||('保存できませんでした：'+e.code)}finally{submit.disabled=false}
});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelector('#detailAdd').onclick=()=>{const s=selected;detail.close();openForm(s.group,s.n,s.day)};document.querySelector('#new').onclick=()=>openForm();dateInput.onchange=render;document.querySelector('#today').onclick=()=>{dateInput.value=localDay(new Date());render()};function shift(days){const d=new Date(dateInput.value+'T12:00:00');d.setDate(d.getDate()+days);dateInput.value=localDay(d);render()}document.querySelector('#prev').onclick=()=>shift(view==='week'?-7:-1);document.querySelector('#next').onclick=()=>shift(view==='week'?7:1);for(const [id,mode] of [['weekView','week'],['dayView','day']])document.getElementById(id).onclick=()=>{view=mode;for(const [other,m] of [['weekView','week'],['dayView','day']]){const b=document.getElementById(other);b.classList.toggle('active',m===view);b.setAttribute('aria-pressed',String(m===view))}render()};render();
