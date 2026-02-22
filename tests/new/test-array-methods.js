// expected: 3
// expected: 2
// expected: 4
// expected: 1
// expected: false
let arr = [1, 2, 3];
let x = arr.pop();
console.log(x);
console.log(arr.length);
arr = [3, 4, 5];
let first = arr.shift();
console.log(arr[0]);
console.log(arr.indexOf(5));
console.log(arr.includes(3));
