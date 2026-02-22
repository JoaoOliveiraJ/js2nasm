// Test default values in array destructuring
const [a, b, c = 99] = [1, 2];
console.log(a, b, c);

// Test default values in object destructuring
const { name, age = 25 } = { name: 42 };
console.log(name, age);

// Test nested destructuring
const { coords: { cx, cy } } = { coords: { cx: 100, cy: 200 } };
console.log(cx, cy);

// Test array rest in destructuring
const [first, ...rest] = [10, 20, 30, 40];
console.log(first, rest[0], rest[1], rest[2]);
