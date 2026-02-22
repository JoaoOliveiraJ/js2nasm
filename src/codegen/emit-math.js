'use strict';

function emitMathAbs(dest, src) {
  this.instr(`mov rax, ${this.loc(src)}`);
  this.instr('cqo');                     // rdx = sign extension
  this.instr('xor rax, rdx');            // flip bits if negative
  this.instr('sub rax, rdx');            // add 1 if was negative
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathMax(dest, left, right) {
  this.instr(`mov rax, ${this.loc(left)}`);
  this.instr(`mov rcx, ${this.loc(right)}`);
  this.instr('cmp rax, rcx');
  this.instr('cmovl rax, rcx');          // if left < right, take right
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathMin(dest, left, right) {
  this.instr(`mov rax, ${this.loc(left)}`);
  this.instr(`mov rcx, ${this.loc(right)}`);
  this.instr('cmp rax, rcx');
  this.instr('cmovg rax, rcx');          // if left > right, take right
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathSqrt(dest, src) {
  // Convert integer to double, sqrt, store as double (TYPE_FLOAT)
  this.instr(`cvtsi2sd xmm0, ${this.loc(src)}`);
  this.instr('sqrtsd xmm0, xmm0');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathPow(dest, base, exp) {
  // Integer power via loop: result = 1; while(exp > 0) { result *= base; exp--; }
  const loopLbl = this.newLabel('pow_loop');
  const endLbl = this.newLabel('pow_end');
  this.instr(`mov rax, 1`);             // result = 1
  this.instr(`mov rcx, ${this.loc(base)}`);
  this.instr(`mov rdx, ${this.loc(exp)}`);
  this.label(loopLbl);
  this.instr('test rdx, rdx');
  this.instr(`jz ${endLbl}`);
  this.instr('imul rax, rcx');           // result *= base
  this.instr('dec rdx');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitBitOp(op, dest, left, right) {
  this.instr(`mov rax, ${this.loc(left)}`);
  this.instr(`${op} rax, ${this.loc(right)}`);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitShift(op, dest, left, right) {
  this.instr(`mov rax, ${this.loc(left)}`);
  this.instr(`mov rcx, ${this.loc(right)}`);
  this.instr(`${op} rax, cl`);           // shift by cl (low byte of rcx)
  this.instr(`mov ${this.loc(dest)}, rax`);
}

module.exports = {
  emitMathAbs,
  emitMathMax,
  emitMathMin,
  emitMathSqrt,
  emitMathPow,
  emitBitOp,
  emitShift,
};
