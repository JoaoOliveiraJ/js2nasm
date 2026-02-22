// Test getter and setter
class Circle {
  constructor(radius) {
    this.radius = radius;
  }
  get area() {
    return this.radius * this.radius * 3;
  }
  get diameter() {
    return this.radius * 2;
  }
  set size(val) {
    this.radius = val;
  }
}

const c = new Circle(5);
console.log(c.area);
console.log(c.diameter);
c.size = 10;
console.log(c.area);
