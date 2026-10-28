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

