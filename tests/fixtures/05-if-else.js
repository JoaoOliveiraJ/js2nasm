// expected: positive\nzero
let x = 5;
if (x > 0) {
  console.log("positive");
} else {
  console.log("negative");
}
let y = 0;
if (y > 0) {
  console.log("positive");
} else if (y < 0) {
  console.log("negative");
} else {
  console.log("zero");
}
