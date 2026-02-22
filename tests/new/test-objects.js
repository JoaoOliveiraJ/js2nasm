// expected: 42\nhello\n99\n100
let obj = { x: 42, y: "hello" };
console.log(obj.x);
console.log(obj.y);
obj.x = 99;
console.log(obj.x);
obj["z"] = 100;
console.log(obj["z"]);
