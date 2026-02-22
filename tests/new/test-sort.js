// Test array sort
let arr = [5, 2, 8, 1, 9, 3];
arr.sort();
console.log(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]);

// Sort with comparator (descending)
let arr2 = [5, 2, 8, 1, 9, 3];
arr2.sort((a, b) => b - a);
console.log(arr2[0], arr2[1], arr2[2], arr2[3], arr2[4], arr2[5]);
