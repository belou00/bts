// src/utils/money.js
function splitInstallments(totalCents, count, firstDue=new Date()) {
  if (![1,2,3].includes(count)) throw new Error('count must be 1|2|3');
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const schedule = [];
  for (let i=0;i<count;i++){
    const amount = base + (i < remainder ? 1 : 0);
    const dueDate = new Date(firstDue);
    if (i>0) dueDate.setMonth(dueDate.getMonth()+i); // mensuel
    schedule.push({ dueDate, amountCents: amount, status:'pending' });
  }
  return schedule;
}
module.exports = { splitInstallments };
