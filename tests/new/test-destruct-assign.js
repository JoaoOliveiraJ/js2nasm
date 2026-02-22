// Test destructuring assignment (swap)
let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b);

// Test object destructuring assignment
let x = 0;
let y = 0;
const point = { x: 10, y: 20 };
({ x, y } = point);
console.log(x, y);
