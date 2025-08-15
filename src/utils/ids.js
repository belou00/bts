function orderNo() {
  return 'ORD-' + Date.now();
}
function subscriberNo(seasonCode, n) {
  return `BTS-${seasonCode}-${String(n).padStart(6,'0')}`;
}
module.exports = { orderNo, subscriberNo };
