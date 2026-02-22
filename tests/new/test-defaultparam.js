// Testa parâmetros default
function greet(name, greeting = 1) {
  return name + greeting;
}
console.log(greet(10, 5));
console.log(greet(100));
// esperado:
// 15
// 101
