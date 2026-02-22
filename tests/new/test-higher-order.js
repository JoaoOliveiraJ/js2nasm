// Testa métodos de alta ordem de array
const arr = [1, 2, 3, 4, 5];

// forEach
let sum = 0;
arr.forEach(function(x) {
  sum = sum + x;
});
console.log(sum);

// map
const doubled = arr.map(x => x * 2);
console.log(doubled[0], doubled[1], doubled[2]);

// filter
const evens = arr.filter(x => x % 2 === 0);
console.log(evens[0], evens[1]);

// reduce
const total = arr.reduce((acc, x) => acc + x, 0);
console.log(total);

// find
const found = arr.find(x => x > 3);
console.log(found);

// some
const hasEven = arr.some(x => x % 2 === 0);
console.log(hasEven);

// every
const allPositive = arr.every(x => x > 0);
console.log(allPositive);

// findIndex
const idx = arr.findIndex(x => x === 3);
console.log(idx);
