// Test function expressions
const add = function(a, b) {
  return a + b;
};

console.log(add(3, 5));

// Named function expression (name used for recursion)
const factorial = function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
};

console.log(factorial(5));
