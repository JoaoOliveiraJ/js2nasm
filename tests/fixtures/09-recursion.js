// expected: 55\n3628800
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
console.log(fibonacci(10));
console.log(factorial(10));
