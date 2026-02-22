// expected: 55
function sum(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total = total + i;
  }
  return total;
}
console.log(sum(10));
