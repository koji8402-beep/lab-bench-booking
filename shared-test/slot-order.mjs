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
export function findOverlap(records, candidate) {
  const from=toMinutes(candidate.start), to=toMinutes(candidate.end);
  return records.find(r=>r.id!==candidate.id && !r.cancelled && r.ownerUid===candidate.ownerUid && r.date===candidate.date && equipmentGroup(r.equipment)===equipmentGroup(candidate.equipment) && toMinutes(r.start)<to && toMinutes(r.end)>from) || null;
}
export function visibleAnchor(anchor, target, view) {
  if (view==='day') return target;
  const d=new Date(anchor+'T12:00:00');
  d.setDate(d.getDate()+7);
  const end=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return target>=anchor && target<end ? anchor : target;
}

