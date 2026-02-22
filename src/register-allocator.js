'use strict';

// Simple register allocator
// For now, we use a stack-based approach (all temps live on the stack)
// This is simpler and correct, though less performant than register allocation

// Available volatile registers for general use (caller-saved)
const VOLATILE_REGS = ['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11'];

// Callee-saved registers (must be preserved across calls)
const CALLEE_SAVED = ['rbx', 'rdi', 'rsi', 'r12', 'r13', 'r14', 'r15'];

// Parameter registers (Microsoft x64 calling convention)
const PARAM_REGS = ['rcx', 'rdx', 'r8', 'r9'];

// Float parameter registers
const FLOAT_PARAM_REGS = ['xmm0', 'xmm1', 'xmm2', 'xmm3'];

class RegisterAllocator {
  constructor() {
    this.allocations = new Map(); // temp → register or stack offset
  }

  // For now, everything goes on the stack
  // Future optimization: linear scan register allocation
  allocate(temp) {
    // Stack-based: each temp gets a stack slot
    return null;
  }
}

module.exports = {
  RegisterAllocator,
  VOLATILE_REGS,
  CALLEE_SAVED,
  PARAM_REGS,
  FLOAT_PARAM_REGS,
};
