// Testa novos métodos de string
const s = "hello";
console.log(s.charCodeAt(0));

const c = String.fromCharCode(65);
console.log(c);

const padded = "42".padStart(5, "0");
console.log(padded);

const padded2 = "hi".padEnd(6, "!");
console.log(padded2);

// Métodos Number
console.log(Number.isInteger(42));
console.log(Number.isFinite(100));
