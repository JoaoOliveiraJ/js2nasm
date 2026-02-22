// expected: 1\n1\n2\n6\n24\n120\n720\n5040\n40320\n362880
function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}
for (let i = 1; i <= 10; i++) {
  console.log(fact(i));
}
