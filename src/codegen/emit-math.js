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

function emitMathRound(dest, src) {
  // For integers, round is identity (no floats yet in most paths)
  this.instr(`mov rax, ${this.loc(src)}`);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathCeil(dest, src) {
  // For integers, ceil is identity
  this.instr(`mov rax, ${this.loc(src)}`);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathTrunc(dest, src) {
  // For integers, trunc is identity
  this.instr(`mov rax, ${this.loc(src)}`);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathSign(dest, src) {
  // sign(x) = x > 0 ? 1 : x < 0 ? -1 : 0
  const negLbl = this.newLabel('sign_neg');
  const zeroLbl = this.newLabel('sign_zero');
  const endLbl = this.newLabel('sign_end');
  this.instr(`mov rax, ${this.loc(src)}`);
  this.instr('test rax, rax');
  this.instr(`jz ${zeroLbl}`);
  this.instr(`js ${negLbl}`);
  this.instr('mov rax, 1');
  this.instr(`jmp ${endLbl}`);
  this.label(negLbl);
  this.instr('mov rax, -1');
  this.instr(`jmp ${endLbl}`);
  this.label(zeroLbl);
  this.instr('xor rax, rax');
  this.label(endLbl);
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathRandom(dest) {
  // Use rdtsc for pseudo-random (simple but fast)
  // Returns a value between 0 and 32767 (like rand())
  this.instr('rdtsc');                    // result in edx:eax
  this.instr('and eax, 0x7FFF');          // limit to 0-32767
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathLog(dest, src) {
  // log(x) using x87 FPU: fldln2; fild src; fyl2x
  this.instr(`mov ${this.loc(dest)}, ${this.loc(src)}`); // use dest as temp storage
  this.instr('fldln2');                   // push ln(2) to FPU stack
  this.instr(`fild qword ${this.loc(dest)}`); // push integer as float
  this.instr('fyl2x');                    // ST(1) * log2(ST(0)) = ln(2) * log2(x) = ln(x)
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');         // pop result to stack
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathLog2(dest, src) {
  // log2(x) using x87 FPU: fld1; fild src; fyl2x
  this.instr(`mov ${this.loc(dest)}, ${this.loc(src)}`);
  this.instr('fld1');                     // push 1.0
  this.instr(`fild qword ${this.loc(dest)}`);
  this.instr('fyl2x');                    // 1.0 * log2(x) = log2(x)
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathSin(dest, src) {
  // sin(x) using x87 FPU: fild src; fsin
  this.instr(`mov ${this.loc(dest)}, ${this.loc(src)}`);
  this.instr(`fild qword ${this.loc(dest)}`);
  this.instr('fsin');
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathCos(dest, src) {
  this.instr(`mov ${this.loc(dest)}, ${this.loc(src)}`);
  this.instr(`fild qword ${this.loc(dest)}`);
  this.instr('fcos');
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathTan(dest, src) {
  this.instr(`mov ${this.loc(dest)}, ${this.loc(src)}`);
  this.instr(`fild qword ${this.loc(dest)}`);
  this.instr('fptan');                    // pushes tan and 1.0
  this.instr('fstp st0');                 // pop the 1.0
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathAtan2(dest, y, x) {
  // atan2(y, x) using x87: fild x; fild y; fpatan
  this.instr(`mov ${this.loc(dest)}, ${this.loc(x)}`);
  this.instr(`fild qword ${this.loc(dest)}`);     // push x
  this.instr(`mov ${this.loc(dest)}, ${this.loc(y)}`);
  this.instr(`fild qword ${this.loc(dest)}`);     // push y
  this.instr('fpatan');                            // atan2(y, x) = atan(ST(1)/ST(0))
  this.instr('sub rsp, 8');
  this.instr('fstp qword [rsp]');
  this.instr('movsd xmm0, [rsp]');
  this.instr('add rsp, 8');
  this.instr('movq rax, xmm0');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitMathClz32(dest, src) {
  // Count leading zeros in 32-bit
  const zeroLbl = this.newLabel('clz_zero');
  const endLbl = this.newLabel('clz_end');
  this.instr(`mov eax, ${this.loc(src)}`);
  this.instr('test eax, eax');
  this.instr(`jz ${zeroLbl}`);
  this.instr('bsr ecx, eax');           // bit scan reverse
  this.instr('mov eax, 31');
  this.instr('sub eax, ecx');           // clz = 31 - bsr
  this.instr(`jmp ${endLbl}`);
  this.label(zeroLbl);
  this.instr('mov eax, 32');
  this.label(endLbl);
  this.instr('movsxd rax, eax');
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
  emitMathRound,
  emitMathCeil,
  emitMathTrunc,
  emitMathSign,
  emitMathRandom,
  emitMathLog,
  emitMathLog2,
  emitMathSin,
  emitMathCos,
  emitMathTan,
  emitMathAtan2,
  emitMathClz32,
  emitBitOp,
  emitShift,
};
