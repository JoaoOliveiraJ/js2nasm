// expected: 0\n1\n1\n2\n3\n5\n8\n13\n21\n34
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
for (let i = 0; i < 10; i++) {
  console.log(fib(i));
}
