// Test for...of with string
let count = 0;
for (const ch of "hello") {
  count = count + 1;
}
console.log(count);

// Test for...of with array (existing)
let sum = 0;
for (const x of [1, 2, 3, 4]) {
  sum = sum + x;
}
console.log(sum);
