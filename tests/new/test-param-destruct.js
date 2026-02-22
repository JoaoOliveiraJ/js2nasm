// Test parameter destructuring
function add({ x, y }) {
  return x + y;
}

const point = { x: 10, y: 20 };
console.log(add(point));

// Array destructuring in params
function sum([a, b, c]) {
  return a + b + c;
}

console.log(sum([10, 20, 30]));

// Arrow with destructuring
const getX = ({ x }) => x;
console.log(getX({ x: 42 }));
