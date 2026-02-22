// expected: 10\n20\n200
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  getX() {
    return this.x;
  }

  area() {
    return this.x * this.y;
  }
}

let p = new Point(10, 20);
console.log(p.getX());
console.log(p.y);
console.log(p.area());
