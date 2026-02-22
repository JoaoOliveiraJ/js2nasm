// Test class inheritance
class Animal {
  constructor(name, legs) {
    this.name = name;
    this.legs = legs;
  }
  getLegs() {
    return this.legs;
  }
}

class Dog extends Animal {
  constructor(name) {
    super(name, 4);
    this.sound = 1; // 1 = woof
  }
  getSound() {
    return this.sound;
  }
}

const dog = new Dog(42);
console.log(dog.getLegs());
console.log(dog.getSound());

// Test super.method()
class Base {
  constructor(x) {
    this.x = x;
  }
  getValue() {
    return this.x;
  }
}

class Child extends Base {
  constructor(x, y) {
    super(x);
    this.y = y;
  }
  getSum() {
    return this.x + this.y;
  }
}

const c = new Child(10, 20);
console.log(c.getValue());
console.log(c.getSum());
