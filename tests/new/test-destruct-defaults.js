// Testa valores default em destructuring de array
const [a, b, c = 99] = [1, 2];
console.log(a, b, c);

// Testa valores default em destructuring de objeto
const { name, age = 25 } = { name: 42 };
console.log(name, age);

// Testa destructuring aninhado
const { coords: { cx, cy } } = { coords: { cx: 100, cy: 200 } };
console.log(cx, cy);

// Testa rest de array em destructuring
const [first, ...rest] = [10, 20, 30, 40];
console.log(first, rest[0], rest[1], rest[2]);
