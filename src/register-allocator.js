'use strict';

// Alocador de registradores simples
// Por enquanto, usamos uma abordagem baseada em pilha (todos os temporários ficam na pilha)
// Isso é mais simples e correto, embora menos performático que alocação de registradores

// Registradores voláteis disponíveis para uso geral (salvos pelo chamador)
const VOLATILE_REGS = ['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11'];

// Registradores salvos pelo chamado (devem ser preservados entre chamadas)
const CALLEE_SAVED = ['rbx', 'rdi', 'rsi', 'r12', 'r13', 'r14', 'r15'];

// Registradores de parâmetro (convenção de chamada Microsoft x64)
const PARAM_REGS = ['rcx', 'rdx', 'r8', 'r9'];

// Registradores de parâmetro de ponto flutuante
const FLOAT_PARAM_REGS = ['xmm0', 'xmm1', 'xmm2', 'xmm3'];

class RegisterAllocator {
  constructor() {
    this.allocations = new Map(); // temp → registrador ou deslocamento na pilha
  }

  // Por enquanto, tudo vai para a pilha
  // Otimização futura: alocação de registradores por varredura linear
  allocate(temp) {
    // Baseado em pilha: cada temporário recebe um slot na pilha
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
