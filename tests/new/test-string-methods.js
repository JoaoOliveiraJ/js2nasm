// expected: H\n2\n-1\ntrue\nfalse\nHELLO\nhello\ntrimmed
let s = "Hello";
console.log(s.charAt(0));
console.log(s.indexOf("llo"));
console.log(s.indexOf("world"));
console.log(s.includes("ell"));
console.log(s.includes("xyz"));
console.log(s.toUpperCase());
console.log(s.toLowerCase());
let padded = "  trimmed  ";
console.log(padded.trim());
