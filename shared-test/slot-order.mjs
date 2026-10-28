export function toMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('invalid time');
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('invalid time');
  return hour * 60 + minute;
}
export function slotKeys(start, end) {
  const a=toMinutes(start), b=toMinutes(end);
  if (a % 30 || b % 30 || b <= a) throw new Error('invalid range');
  return Array.from({length:(b-a)/30},(_,i)=>String(a+i*30));
}
export function changeSlotTimes(request,start,end,newStamp) {
  const oldKeys=new Set(slotKeys(request.start,request.end));
  const old=request.slotTimes || {};
  return Object.fromEntries(slotKeys(start,end).map(key=>[key,oldKeys.has(key)?(old[key] || request.createdAt):newStamp()]));
}
export function orderForSlot(request,minute) {
  return request.slotTimes?.[String(minute)] || request.createdAt || null;
}
export function equipmentGroup(equipment) {
  return ['either','one','two'].includes(equipment) ? 'culture' : equipment;
}
export function sameReservationEquipment(a,b) {
  return a===b || (equipmentGroup(a)==='culture' && equipmentGroup(b)==='culture' && (a==='either'||b==='either'));
}
export function oppositeBenchOverlaps(records,candidate) {
  const opposite=candidate.equipment==='one'?'two':candidate.equipment==='two'?'one':null;
  if(!opposite)return [];
  const from=toMinutes(candidate.start),to=toMinutes(candidate.end);
  return records.filter(r=>r.id!==candidate.id&&!r.cancelled&&r.ownerUid===candidate.ownerUid&&r.date===candidate.date&&r.equipment===opposite&&toMinutes(r.start)<to&&toMinutes(r.end)>from);
}
export function findOverlap(records, candidate) {
  const from=toMinutes(candidate.start), to=toMinutes(candidate.end);
  return records.find(r=>r.id!==candidate.id && !r.cancelled && r.ownerUid===candidate.ownerUid && r.date===candidate.date && sameReservationEquipment(r.equipment,candidate.equipment) && toMinutes(r.start)<to && toMinutes(r.end)>from) || null;
}
export function uncoveredIntervals(records,candidate) {
  const start=toMinutes(candidate.start),end=toMinutes(candidate.end);
  let intervals=[[start,end]];
  for(const r of records) {
    if(r.id===candidate.id||r.cancelled||r.ownerUid!==candidate.ownerUid||r.date!==candidate.date||!sameReservationEquipment(r.equipment,candidate.equipment))continue;
    const a=toMinutes(r.start),b=toMinutes(r.end);
    intervals=intervals.flatMap(([left,right])=>{
      if(b<=left||a>=right)return [[left,right]];
      const remain=[];if(a>left)remain.push([left,Math.min(a,right)]);if(b<right)remain.push([Math.max(b,left),right]);return remain;
    });
  }
  const format=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  return intervals.map(([a,b])=>({start:format(a),end:format(b)}));
}
export function visibleAnchor(anchor, target, view) {
  if (view==='day') return target;
  const d=new Date(anchor+'T12:00:00');
  d.setDate(d.getDate()+7);
  const end=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return target>=anchor && target<end ? anchor : target;
}
