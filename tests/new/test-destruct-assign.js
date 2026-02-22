// Testa atribuição com destructuring (troca)
let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b);

// Testa atribuição com destructuring de objeto
let x = 0;
let y = 0;
const point = { x: 10, y: 20 };
({ x, y } = point);
console.log(x, y);
