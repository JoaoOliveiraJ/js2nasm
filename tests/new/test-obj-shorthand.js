// Test property shorthand
let x = 10;
let y = 20;
const point = { x, y };
console.log(point.x, point.y);

// Method shorthand
const obj = { x: 5, y: 3 };
// Just test property shorthand for now
const a = 100;
const b = 200;
const pair = { a, b };
console.log(pair.a + pair.b);
