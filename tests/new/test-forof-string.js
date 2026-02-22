// Testa for...of com string
let count = 0;
for (const ch of "hello") {
  count = count + 1;
}
console.log(count);

// Testa for...of com array (existente)
let sum = 0;
for (const x of [1, 2, 3, 4]) {
  sum = sum + x;
}
console.log(sum);
