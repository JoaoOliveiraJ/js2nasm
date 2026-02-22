// Testa loop for...in
const obj = { a: 1, b: 2, c: 3 };

let sum = 0;
for (let key in obj) {
  sum = sum + 1;
}
console.log(sum);
