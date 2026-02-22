// Testa expressões de função
const add = function(a, b) {
  return a + b;
};

console.log(add(3, 5));

// Expressão de função nomeada (nome usado para recursão)
const factorial = function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
};

console.log(factorial(5));
