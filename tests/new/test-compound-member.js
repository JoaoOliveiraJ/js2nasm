// Testa atribuição composta de expressões de membro
const obj = { x: 10, y: 20 };
obj.x += 5;
obj.y *= 2;
console.log(obj.x, obj.y);

const arr = [1, 2, 3, 4, 5];
arr[0] += 100;
arr[2] -= 1;
arr[4] *= 3;
console.log(arr[0], arr[2], arr[4]);
