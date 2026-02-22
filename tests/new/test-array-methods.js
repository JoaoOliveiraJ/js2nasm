// esperado: 3
// esperado: 2
// esperado: 4
// esperado: 1
// esperado: false
let arr = [1, 2, 3];
let x = arr.pop();
console.log(x);
console.log(arr.length);
arr = [3, 4, 5];
let first = arr.shift();
console.log(arr[0]);
console.log(arr.indexOf(5));
console.log(arr.includes(3));
