// esperado: before\ncaught: 42\nafter
console.log("before");
try {
  throw 42;
  console.log("unreachable");
} catch (e) {
  console.log("caught: " + e);
}
console.log("after");
