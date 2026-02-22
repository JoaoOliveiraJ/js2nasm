// esperado: 99\n42\n99
let a = 5;
a &&= 99;
console.log(a);

let b = 0;
b ||= 42;
console.log(b);

let c = 0;
c ??= 99;
console.log(c);
