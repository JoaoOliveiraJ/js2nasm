// expected: 4\n1\n2\n3\n99
let arr = [1, 2, 3];
let arr2 = [...arr, 99];
console.log(arr2.length);
console.log(arr2[0]);
console.log(arr2[1]);
console.log(arr2[2]);
console.log(arr2[3]);
