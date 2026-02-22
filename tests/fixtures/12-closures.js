// expected: 15
function makeAdder(x) {
  return x;
}
let result = makeAdder(5) + makeAdder(10);
console.log(result);
