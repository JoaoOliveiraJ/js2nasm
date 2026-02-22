// Test static methods
class MathHelper {
  static add(a, b) {
    return a + b;
  }
  static multiply(a, b) {
    return a * b;
  }
}

console.log(MathHelper.add(3, 4));
console.log(MathHelper.multiply(5, 6));

// Test static + instance methods together
class Counter {
  constructor(start) {
    this.count = start;
  }
  static create(val) {
    return val;
  }
  getCount() {
    return this.count;
  }
}

const c = new Counter(42);
console.log(c.getCount());
console.log(Counter.create(100));
