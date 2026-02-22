// Test labeled break
let found = 0;
outer: for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 5; j++) {
    if (i === 2 && j === 3) {
      found = 1;
      break outer;
    }
  }
}
console.log(found);
