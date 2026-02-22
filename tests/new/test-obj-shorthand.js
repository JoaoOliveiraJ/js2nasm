// Testa abreviação de propriedade
let x = 10;
let y = 20;
const point = { x, y };
console.log(point.x, point.y);

// Abreviação de método
const obj = { x: 5, y: 3 };
// Apenas testa abreviação de propriedade por enquanto
const a = 100;
const b = 200;
const pair = { a, b };
console.log(pair.a + pair.b);
