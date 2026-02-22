'use strict';

const { OP } = require('./ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY } = require('./types');

class CodeGenerator {
  constructor(irProgram) {
    this.ir = irProgram;
    this.output = [];
    this.tempOffsets = new Map();  // temp/var name → stack offset from rbp
    this.nextOffset = 0;
    this.currentLocals = null;
    this.inFunction = false; // true when emitting function code
    this._labelCounter = 0;
  }

  getOffset(name) {
    // Global variables don't need stack space
    if (this.isGlobal(name)) return -1;
    if (!this.tempOffsets.has(name)) {
      this.nextOffset += 8;
      this.tempOffsets.set(name, this.nextOffset);
    }
    return this.tempOffsets.get(name);
  }

  isGlobal(name) {
    return this.ir.globals.has(name);
  }

  loc(name) {
    // Global variables use BSS section labels
    if (this.isGlobal(name)) {
      return `[gvar_${name}]`;
    }
    return `[rbp-${this.getOffset(name)}]`;
  }

  line(s) {
    this.output.push(s);
  }

  blank() {
    this.output.push('');
  }

  comment(s) {
    this.output.push(`    ; ${s}`);
  }

  instr(s) {
    this.output.push(`    ${s}`);
  }

  label(name) {
    this.output.push(`${name}:`);
  }

  generate() {
    this.emitHeader();
    this.emitDataSection();
    this.emitTextSection();
    return this.output.join('\n') + '\n';
  }

  emitHeader() {
    this.line('default rel');
    this.line('bits 64');
    this.blank();
  }

  emitDataSection() {
    this.line('section .data');
    this.instr('hStdout dq 0');
    this.instr('hHeap dq 0');
    this.instr('STD_OUTPUT_HANDLE equ -11');
    this.instr('UNDEF_SENTINEL equ 0x8000000000000001');
    this.instr('fmt_int db "%lld", 0');
    this.instr('fmt_int_nl db "%lld", 13, 10, 0');
    this.instr('fmt_str db "%s", 0');
    this.instr('fmt_str_nl db "%s", 13, 10, 0');
    this.instr('fmt_float db "%.6g", 0');
    this.instr('fmt_float_nl db "%.6g", 13, 10, 0');
    this.instr('fmt_newline db 13, 10, 0');
    this.instr('str_true db "true", 0');
    this.instr('str_false db "false", 0');
    this.instr('str_null db "null", 0');
    this.instr('str_undefined db "undefined", 0');
    this.blank();

    // String literals
    for (const { label, value } of this.ir.strings) {
      const escaped = this.escapeNasmString(value);
      this.instr(`${label} db ${escaped}, 0`);
    }
    this.blank();

    // Float constants
    for (const { label, value } of this.ir.floats) {
      this.instr(`${label} dq ${this.floatToHex(value)}`);
    }
    this.blank();

    this.line('section .bss');
    this.instr('print_buf resb 256');
    // Exception handler stack (up to 32 nested try blocks, 24 bytes each: handler_addr + saved_rbp + saved_rsp)
    this.instr('_exc_stack resb 768');  // 32 * 24
    this.instr('_exc_sp resq 1');
    // Global variable storage
    for (const name of this.ir.globals) {
      this.instr(`gvar_${name} resq 1`);
    }
    this.blank();
  }

  escapeNasmString(str) {
    if (str.length === 0) return '""';
    const parts = [];
    let current = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 32 && code < 127 && str[i] !== '"' && str[i] !== '\\') {
        current += str[i];
      } else {
        if (current.length > 0) {
          parts.push(`"${current}"`);
          current = '';
        }
        parts.push(code.toString());
      }
    }
    if (current.length > 0) {
      parts.push(`"${current}"`);
    }
    return parts.join(', ');
  }

  floatToHex(value) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(value, 0);
    return '0x' + buf.toString('hex');
  }

  emitTextSection() {
    this.line('section .text');
    this.instr('global main');
    this.blank();
    this.instr('extern GetStdHandle');
    this.instr('extern WriteConsoleA');
    this.instr('extern ExitProcess');
    this.instr('extern GetProcessHeap');
    this.instr('extern HeapAlloc');
    this.instr('extern printf');
    this.instr('extern malloc');
    this.instr('extern free');
    this.instr('extern _snprintf');
    this.instr('extern strlen');
    this.instr('extern memcpy');
    this.instr('extern putchar');
    this.instr('extern strstr');
    this.instr('extern realloc');
    this.instr('extern strcmp');
    this.instr('extern strncmp');
    this.instr('extern atoi');
    this.instr('extern atof');
    this.instr('extern memmove');
    this.instr('extern strcat');
    this.blank();

    // Helper functions
    this.emitHelpers();

    // User functions
    for (const func of this.ir.functions) {
      this.emitFunction(func);
    }

    // Main
    this.emitMain();
  }

  emitFunction(func) {
    this.tempOffsets = new Map();
    this.nextOffset = 0;
    this.inFunction = true;

    // Pre-scan to determine stack needs
    this.prescanInstructions(func.body);

    const stackSize = this.alignStack(this.nextOffset + 32); // +32 shadow space

    this.label(`func_${func.name}`);
    this.instr('push rbp');
    this.instr('mov rbp, rsp');
    this.instr(`sub rsp, ${stackSize}`);
    this.blank();

    // Save params from registers to stack (first 4)
    const paramRegs = ['rcx', 'rdx', 'r8', 'r9'];
    for (let i = 0; i < func.params.length && i < 4; i++) {
      this.instr(`mov ${this.loc(func.params[i])}, ${paramRegs[i]}`);
    }
    // Load extra params from caller's stack (>4)
    // Windows x64: first 4 in regs, rest at [rbp+16+32+i*8] = [rbp+48+i*8]
    // (rbp+0 = saved rbp, rbp+8 = return addr, rbp+16..47 = shadow space, rbp+48+ = extra args)
    for (let i = 4; i < func.params.length; i++) {
      const stackArgOffset = 16 + 32 + (i - 4) * 8; // skip saved rbp + ret addr + shadow space
      this.instr(`mov rax, [rbp+${stackArgOffset}]`);
      this.instr(`mov ${this.loc(func.params[i])}, rax`);
    }
    this.blank();

    this.emitInstructions(func.body);

    // Default return (in case no explicit return)
    this.comment('default return 0');
    this.instr('xor rax, rax');
    this.instr('leave');
    this.instr('ret');
    this.blank();
    this.inFunction = false;
  }

  emitMain() {
    this.tempOffsets = new Map();
    this.nextOffset = 0;
    this.inFunction = false;

    // Pre-scan main instructions
    this.prescanInstructions(this.ir.main);

    const stackSize = this.alignStack(this.nextOffset + 32);

    this.label('main');
    this.instr('push rbp');
    this.instr('mov rbp, rsp');
    this.instr(`sub rsp, ${stackSize}`);
    this.blank();

    // Init stdout handle
    this.comment('Init stdout');
    this.instr('sub rsp, 32');
    this.instr('mov rcx, STD_OUTPUT_HANDLE');
    this.instr('call GetStdHandle');
    this.instr('add rsp, 32');
    this.instr('mov [hStdout], rax');
    this.blank();

    // Init heap
    this.comment('Init heap');
    this.instr('sub rsp, 32');
    this.instr('call GetProcessHeap');
    this.instr('add rsp, 32');
    this.instr('mov [hHeap], rax');
    this.blank();

    this.emitInstructions(this.ir.main);
    this.blank();

    // ExitProcess(0)
    this.comment('ExitProcess(0)');
    this.instr('xor rcx, rcx');
    this.instr('call ExitProcess');
    this.blank();
  }

  prescanInstructions(instructions) {
    for (const inst of instructions) {
      const ops = inst.operands;
      switch (inst.op) {
        case OP.LOAD_INT:
        case OP.LOAD_FLOAT:
        case OP.LOAD_STRING:
        case OP.LOAD_BOOL:
        case OP.LOAD_NULL:
        case OP.LOAD_UNDEFINED:
        case OP.LOAD_VAR:
        case OP.NEG:
        case OP.NOT:
          this.getOffset(ops[0]);
          break;
        case OP.STORE_VAR:
          this.getOffset(ops[0]);
          break;
        case OP.ADD:
        case OP.SUB:
        case OP.MUL:
        case OP.DIV:
        case OP.MOD:
        case OP.POW:
        case OP.CMP_EQ:
        case OP.CMP_SEQ:
        case OP.CMP_NE:
        case OP.CMP_SNE:
        case OP.CMP_LT:
        case OP.CMP_GT:
        case OP.CMP_LE:
        case OP.CMP_GE:
          this.getOffset(ops[0]);
          break;
        case OP.CALL:
          this.getOffset(ops[0]);
          break;
        case OP.PARAM:
          this.getOffset(ops[0]);
          break;
        case OP.PRE_INC:
        case OP.PRE_DEC:
        case OP.POST_INC:
        case OP.POST_DEC:
          this.getOffset(ops[0]);
          break;
        case OP.STR_CONCAT:
          this.getOffset(ops[0]);
          break;
        case OP.STR_LENGTH:
        case OP.ARRAY_LENGTH:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_NEW:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_GET:
          this.getOffset(ops[0]);
          break;
        case OP.TEMPLATE:
          this.getOffset(ops[0]);
          break;
        case OP.CONSOLE_LOG:
        case OP.CONSOLE_ERROR: {
          const argInfos = ops[0];
          if (Array.isArray(argInfos)) {
            for (const ai of argInfos) {
              this.getOffset(ai.temp);
            }
          }
          break;
        }
        case OP.PROCESS_EXIT:
          this.getOffset(ops[0]);
          break;
        case OP.MATH_ABS:
        case OP.MATH_FLOOR:
        case OP.MATH_SQRT:
          this.getOffset(ops[0]);
          break;
        case OP.MATH_MAX:
        case OP.MATH_MIN:
        case OP.MATH_POW:
          this.getOffset(ops[0]);
          break;
        case OP.BIT_AND:
        case OP.BIT_OR:
        case OP.BIT_XOR:
        case OP.SHL:
        case OP.SHR:
        case OP.USHR:
          this.getOffset(ops[0]);
          break;
        case OP.BIT_NOT:
          this.getOffset(ops[0]);
          break;
        case OP.STR_CHAR_AT:
        case OP.STR_INDEX_OF:
        case OP.STR_INCLUDES:
          this.getOffset(ops[0]);
          break;
        case OP.STR_TO_UPPER:
        case OP.STR_TO_LOWER:
        case OP.STR_TRIM:
          this.getOffset(ops[0]);
          break;
        case OP.OBJ_NEW:
        case OP.OBJ_GET:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_SPREAD:
          break;
        case OP.OBJ_SPREAD:
          break;
        case OP.CALL_SPREAD:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_POP:
        case OP.ARRAY_SHIFT:
        case OP.ARRAY_INDEX_OF:
        case OP.ARRAY_INCLUDES:
        case OP.ARRAY_JOIN:
        case OP.ARRAY_REVERSE:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_SLICE:
        case OP.ARRAY_CONCAT:
          this.getOffset(ops[0]);
          break;
        case OP.ARRAY_UNSHIFT:
          break;
        case OP.STR_SLICE:
        case OP.STR_SUBSTRING:
        case OP.STR_SPLIT:
        case OP.STR_REPLACE:
        case OP.STR_REPEAT:
        case OP.STR_STARTS_WITH:
        case OP.STR_ENDS_WITH:
          this.getOffset(ops[0]);
          break;
        case OP.OBJ_KEYS:
        case OP.OBJ_VALUES:
        case OP.OBJ_ENTRIES:
        case OP.OBJ_HAS_OWN:
          this.getOffset(ops[0]);
          break;
        case OP.OBJ_DELETE:
          break;
        case OP.PARSE_INT:
        case OP.PARSE_FLOAT:
        case OP.TO_STRING:
        case OP.IS_NAN:
        case OP.ARRAY_IS_ARRAY:
        case OP.STR_CMP:
          this.getOffset(ops[0]);
          break;
        case OP.TRY_PUSH:
        case OP.TRY_POP:
          break;
        case OP.THROW:
          break;
        case OP.OBJ_NEW_EMPTY:
          this.getOffset(ops[0]);
          break;
      }
    }
  }

  alignStack(size) {
    // Must be 16-byte aligned. Since push rbp gives 8 bytes offset from 16,
    // sub rsp needs to result in 16-byte alignment
    return Math.ceil(size / 16) * 16;
  }

  emitInstructions(instructions) {
    for (const inst of instructions) {
      this.emitInstruction(inst);
    }
  }

  emitInstruction(inst) {
    const ops = inst.operands;
    switch (inst.op) {
      case OP.LOAD_INT:
        this.emitLoadInt(ops[0], ops[1]);
        break;
      case OP.LOAD_FLOAT:
        this.emitLoadFloat(ops[0], ops[1]);
        break;
      case OP.LOAD_STRING:
        this.emitLoadString(ops[0], ops[1]);
        break;
      case OP.LOAD_BOOL:
        this.emitLoadInt(ops[0], ops[1]);
        break;
      case OP.LOAD_NULL:
        this.emitLoadInt(ops[0], 0);
        break;
      case OP.LOAD_UNDEFINED:
        this.emitLoadInt(ops[0], 0);
        break;
      case OP.LOAD_VAR:
        this.emitLoadVar(ops[0], ops[1]);
        break;
      case OP.STORE_VAR:
        this.emitStoreVar(ops[0], ops[1]);
        break;
      case OP.ADD:
        this.emitBinaryOp('add', ops[0], ops[1], ops[2]);
        break;
      case OP.SUB:
        this.emitBinaryOp('sub', ops[0], ops[1], ops[2]);
        break;
      case OP.MUL:
        this.emitMul(ops[0], ops[1], ops[2]);
        break;
      case OP.DIV:
        this.emitDiv(ops[0], ops[1], ops[2]);
        break;
      case OP.MOD:
        this.emitMod(ops[0], ops[1], ops[2]);
        break;
      case OP.NEG:
        this.emitNeg(ops[0], ops[1]);
        break;
      case OP.NOT:
        this.emitNot(ops[0], ops[1]);
        break;
      case OP.CMP_LT:
        this.emitCmp('setl', ops[0], ops[1], ops[2]);
        break;
      case OP.CMP_GT:
        this.emitCmp('setg', ops[0], ops[1], ops[2]);
        break;
      case OP.CMP_LE:
        this.emitCmp('setle', ops[0], ops[1], ops[2]);
        break;
      case OP.CMP_GE:
        this.emitCmp('setge', ops[0], ops[1], ops[2]);
        break;
      case OP.CMP_EQ:
      case OP.CMP_SEQ:
        this.emitCmp('sete', ops[0], ops[1], ops[2]);
        break;
      case OP.CMP_NE:
      case OP.CMP_SNE:
        this.emitCmp('setne', ops[0], ops[1], ops[2]);
        break;
      case OP.LABEL:
        this.label(ops[0]);
        break;
      case OP.JUMP:
        this.instr(`jmp ${ops[0]}`);
        break;
      case OP.JUMP_IF_FALSE:
        this.instr(`mov rax, ${this.loc(ops[0])}`);
        this.instr('test rax, rax');
        this.instr(`jz ${ops[1]}`);
        break;
      case OP.JUMP_IF_TRUE:
        this.instr(`mov rax, ${this.loc(ops[0])}`);
        this.instr('test rax, rax');
        this.instr(`jnz ${ops[1]}`);
        break;
      case OP.CALL:
        this.emitCall(ops[0], ops[1], ops[2]);
        break;
      case OP.RETURN:
        this.emitReturn(ops[0]);
        break;
      case OP.PARAM:
        // handled in emitFunction
        break;
      case OP.CONSOLE_LOG:
        this.emitConsoleLog(ops[0]);
        break;
      case OP.PRE_INC:
        this.emitPreInc(ops[0], ops[1]);
        break;
      case OP.PRE_DEC:
        this.emitPreDec(ops[0], ops[1]);
        break;
      case OP.POST_INC:
        this.emitPostInc(ops[0], ops[1]);
        break;
      case OP.POST_DEC:
        this.emitPostDec(ops[0], ops[1]);
        break;
      case OP.STR_CONCAT:
        this.emitStrConcat(ops[0], ops[1], ops[2], ops[3], ops[4]);
        break;
      case OP.STR_LENGTH:
        this.emitStrLength(ops[0], ops[1]);
        break;
      case OP.ARRAY_NEW:
        this.emitArrayNew(ops[0], ops[1]);
        break;
      case OP.ARRAY_GET:
        this.emitArrayGet(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_SET:
        this.emitArraySet(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_PUSH:
        this.emitArrayPush(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_LENGTH:
        this.emitArrayLength(ops[0], ops[1]);
        break;
      case OP.TEMPLATE:
        this.emitTemplate(ops[0], ops[1]);
        break;
      case OP.CONSOLE_ERROR:
        // console.error — same as console.log for now (prints to stdout)
        this.emitConsoleLog(ops[0]);
        break;
      case OP.PROCESS_EXIT:
        this.instr(`mov rcx, ${this.loc(ops[0])}`);
        this.instr('call ExitProcess');
        break;
      case OP.MATH_ABS:
        this.emitMathAbs(ops[0], ops[1]);
        break;
      case OP.MATH_MAX:
        this.emitMathMax(ops[0], ops[1], ops[2]);
        break;
      case OP.MATH_MIN:
        this.emitMathMin(ops[0], ops[1], ops[2]);
        break;
      case OP.MATH_FLOOR:
        // For integers, floor is identity
        this.emitLoadVar(ops[0], ops[1]);
        break;
      case OP.MATH_POW:
        this.emitMathPow(ops[0], ops[1], ops[2]);
        break;
      case OP.MATH_SQRT:
        this.emitMathSqrt(ops[0], ops[1]);
        break;
      case OP.BIT_AND:
        this.emitBitOp('and', ops[0], ops[1], ops[2]);
        break;
      case OP.BIT_OR:
        this.emitBitOp('or', ops[0], ops[1], ops[2]);
        break;
      case OP.BIT_XOR:
        this.emitBitOp('xor', ops[0], ops[1], ops[2]);
        break;
      case OP.BIT_NOT:
        this.instr(`mov rax, ${this.loc(ops[1])}`);
        this.instr('not rax');
        this.instr(`mov ${this.loc(ops[0])}, rax`);
        break;
      case OP.SHL:
        this.emitShift('shl', ops[0], ops[1], ops[2]);
        break;
      case OP.SHR:
        this.emitShift('sar', ops[0], ops[1], ops[2]);
        break;
      case OP.USHR:
        this.emitShift('shr', ops[0], ops[1], ops[2]);
        break;
      case OP.JUMP_IF_NOT_UNDEF:
        this.instr(`mov rax, ${this.loc(ops[0])}`);
        this.instr('mov rcx, UNDEF_SENTINEL');
        this.instr('cmp rax, rcx');
        this.instr(`jne ${ops[1]}`);
        break;
      case OP.STR_CHAR_AT:
        this.emitStrCharAt(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_INDEX_OF:
        this.emitStrIndexOf(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_TO_UPPER:
        this.emitStrCase(ops[0], ops[1], 'upper');
        break;
      case OP.STR_TO_LOWER:
        this.emitStrCase(ops[0], ops[1], 'lower');
        break;
      case OP.STR_INCLUDES:
        this.emitStrIncludes(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_TRIM:
        this.emitStrTrim(ops[0], ops[1]);
        break;
      case OP.OBJ_NEW:
        this.emitObjNew(ops[0], ops[1], ops[2]);
        break;
      case OP.OBJ_GET:
        this.emitObjGet(ops[0], ops[1], ops[2]);
        break;
      case OP.OBJ_SET:
        this.emitObjSet(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_SPREAD:
        this.emitArraySpread(ops[0], ops[1]);
        break;
      case OP.OBJ_SPREAD:
        this.emitObjSpread(ops[0], ops[1]);
        break;
      case OP.CALL_SPREAD:
        this.emitCallSpread(ops[0], ops[1], ops[2], ops[3]);
        break;
      case OP.TRY_PUSH:
        this.emitTryPush(ops[0]);
        break;
      case OP.TRY_POP:
        this.emitTryPop();
        break;
      case OP.THROW:
        this.emitThrow(ops[0]);
        break;
      case OP.OBJ_NEW_EMPTY:
        this.emitObjNew(ops[0], [], []);
        break;
      // Array methods
      case OP.ARRAY_POP:
        this.emitArrayPop(ops[0], ops[1]);
        break;
      case OP.ARRAY_SHIFT:
        this.emitArrayShift(ops[0], ops[1]);
        break;
      case OP.ARRAY_UNSHIFT:
        this.emitArrayUnshift(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_INDEX_OF:
        this.emitArrayIndexOf(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_INCLUDES:
        this.emitArrayIncludes(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_JOIN:
        this.emitArrayJoin(ops[0], ops[1], ops[2]);
        break;
      case OP.ARRAY_SLICE:
        this.emitArraySlice(ops[0], ops[1], ops[2], ops[3]);
        break;
      case OP.ARRAY_REVERSE:
        this.emitArrayReverse(ops[0], ops[1]);
        break;
      case OP.ARRAY_CONCAT:
        this.emitArrayConcat(ops[0], ops[1], ops[2]);
        break;
      // String methods
      case OP.STR_SLICE:
        this.emitStrSlice(ops[0], ops[1], ops[2], ops[3]);
        break;
      case OP.STR_SUBSTRING:
        this.emitStrSlice(ops[0], ops[1], ops[2], ops[3]); // same impl
        break;
      case OP.STR_SPLIT:
        this.emitStrSplit(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_REPLACE:
        this.emitStrReplace(ops[0], ops[1], ops[2], ops[3]);
        break;
      case OP.STR_REPEAT:
        this.emitStrRepeat(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_STARTS_WITH:
        this.emitStrStartsWith(ops[0], ops[1], ops[2]);
        break;
      case OP.STR_ENDS_WITH:
        this.emitStrEndsWith(ops[0], ops[1], ops[2]);
        break;
      // Object methods
      case OP.OBJ_KEYS:
        this.emitObjKeys(ops[0], ops[1]);
        break;
      case OP.OBJ_VALUES:
        this.emitObjValues(ops[0], ops[1]);
        break;
      case OP.OBJ_ENTRIES:
        this.emitObjEntries(ops[0], ops[1]);
        break;
      case OP.OBJ_HAS_OWN:
        this.emitObjHasOwn(ops[0], ops[1], ops[2]);
        break;
      case OP.OBJ_DELETE:
        this.comment('OBJ_DELETE not yet implemented');
        break;
      // Builtins
      case OP.PARSE_INT:
        this.emitParseInt(ops[0], ops[1]);
        break;
      case OP.PARSE_FLOAT:
        this.emitParseInt(ops[0], ops[1]); // simplified
        break;
      case OP.TO_STRING:
        this.emitToString(ops[0], ops[1]);
        break;
      case OP.IS_NAN:
        // Simplified: in this runtime without floats, always false for ints
        this.emitLoadInt(ops[0], 0);
        break;
      case OP.ARRAY_IS_ARRAY:
        this.comment('Array.isArray - simplified');
        this.emitLoadInt(ops[0], 0); // simplified placeholder
        break;
      case OP.STR_CMP:
        this.emitStrCmp(ops[0], ops[1], ops[2], ops[3]);
        break;
      case OP.TYPEOF:
        // Already resolved at IR generation time as string literal
        break;
      default:
        this.comment(`UNIMPLEMENTED: ${inst.op}`);
    }
  }

  // ---- Core emit helpers (kept in main file) ----

  emitLoadInt(dest, value) {
    if (value === 0) {
      this.instr('xor rax, rax');
    } else {
      this.instr(`mov rax, ${value}`);
    }
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitLoadFloat(dest, label) {
    this.instr(`movsd xmm0, [${label}]`);
    this.instr(`movq rax, xmm0`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitLoadString(dest, label) {
    this.instr(`lea rax, [${label}]`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitLoadVar(dest, varName) {
    this.instr(`mov rax, ${this.loc(varName)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitStoreVar(varName, src) {
    this.instr(`mov rax, ${this.loc(src)}`);
    this.instr(`mov ${this.loc(varName)}, rax`);
  }

  emitBinaryOp(op, dest, left, right) {
    this.instr(`mov rax, ${this.loc(left)}`);
    this.instr(`${op} rax, ${this.loc(right)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitMul(dest, left, right) {
    this.instr(`mov rax, ${this.loc(left)}`);
    this.instr(`imul rax, ${this.loc(right)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitDiv(dest, left, right) {
    this.instr(`mov rax, ${this.loc(left)}`);
    this.instr('cqo');
    this.instr(`idiv qword ${this.loc(right)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitMod(dest, left, right) {
    this.instr(`mov rax, ${this.loc(left)}`);
    this.instr('cqo');
    this.instr(`idiv qword ${this.loc(right)}`);
    this.instr(`mov ${this.loc(dest)}, rdx`); // remainder in rdx
  }

  emitNeg(dest, src) {
    this.instr(`mov rax, ${this.loc(src)}`);
    this.instr('neg rax');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitNot(dest, src) {
    this.instr(`mov rax, ${this.loc(src)}`);
    this.instr('test rax, rax');
    this.instr('sete al');
    this.instr('movzx rax, al');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitCmp(setInstr, dest, left, right) {
    this.instr(`mov rax, ${this.loc(left)}`);
    this.instr(`cmp rax, ${this.loc(right)}`);
    this.instr(`${setInstr} al`);
    this.instr('movzx rax, al');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitCall(dest, funcName, args) {
    const paramRegs = ['rcx', 'rdx', 'r8', 'r9'];

    // Set unused param registers to sentinel (so default param detection works with falsy values)
    for (let i = 0; i < 4; i++) {
      this.instr(`mov ${paramRegs[i]}, UNDEF_SENTINEL`);
    }

    // Load args into registers (first 4)
    for (let i = 0; i < args.length && i < 4; i++) {
      this.instr(`mov ${paramRegs[i]}, ${this.loc(args[i].temp)}`);
    }

    // Push extra args to stack (>4, right-to-left per Windows x64 ABI)
    let extraStackSize = 0;
    if (args.length > 4) {
      // Align to 16 bytes if odd number of extra args
      const extraArgs = args.length - 4;
      if (extraArgs % 2 !== 0) {
        this.instr('sub rsp, 8'); // padding for alignment
        extraStackSize += 8;
      }
      for (let i = args.length - 1; i >= 4; i--) {
        this.instr(`push qword ${this.loc(args[i].temp)}`);
        extraStackSize += 8;
      }
    }

    // Shadow space + call
    this.instr('sub rsp, 32');
    this.instr(`call func_${funcName}`);
    this.instr(`add rsp, ${32 + extraStackSize}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitReturn(src) {
    if (src) {
      this.instr(`mov rax, ${this.loc(src)}`);
    } else {
      this.instr('xor rax, rax');
    }
    this.instr('leave');
    this.instr('ret');
  }

  emitPreInc(dest, varName) {
    this.instr(`mov rax, ${this.loc(varName)}`);
    this.instr('inc rax');
    this.instr(`mov ${this.loc(varName)}, rax`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitPreDec(dest, varName) {
    this.instr(`mov rax, ${this.loc(varName)}`);
    this.instr('dec rax');
    this.instr(`mov ${this.loc(varName)}, rax`);
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitPostInc(dest, varName) {
    this.instr(`mov rax, ${this.loc(varName)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
    this.instr('inc rax');
    this.instr(`mov ${this.loc(varName)}, rax`);
  }

  emitPostDec(dest, varName) {
    this.instr(`mov rax, ${this.loc(varName)}`);
    this.instr(`mov ${this.loc(dest)}, rax`);
    this.instr('dec rax');
    this.instr(`mov ${this.loc(varName)}, rax`);
  }

  emitParseInt(dest, str) {
    this.comment('parseInt()');
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(str)}`);
    this.instr('call atoi');
    this.instr('add rsp, 32');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitToString(dest, value) {
    this.comment('String()');
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(value)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  emitStrCmp(dest, setInstr, left, right) {
    this.comment('string comparison');
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(left)}`);
    this.instr(`mov rdx, ${this.loc(right)}`);
    this.instr('call strcmp');
    this.instr('add rsp, 32');
    // strcmp returns <0, 0, or >0
    this.instr(`${setInstr} al`);
    this.instr('movzx rax, al');
    this.instr(`mov ${this.loc(dest)}, rax`);
  }

  newLabel(prefix = 'L') {
    return `._cg_${prefix}_${this._labelCounter++}`;
  }
}

// Mixin extracted methods onto prototype
const emitHelpers = require('./codegen/emit-helpers');
const emitIo      = require('./codegen/emit-io');
const emitStrings = require('./codegen/emit-strings');
const emitArrays  = require('./codegen/emit-arrays');
const emitMath    = require('./codegen/emit-math');
const emitObjects    = require('./codegen/emit-objects');
const emitExceptions = require('./codegen/emit-exceptions');

Object.assign(CodeGenerator.prototype,
  emitHelpers,
  emitIo,
  emitStrings,
  emitArrays,
  emitMath,
  emitObjects,
  emitExceptions,
);

module.exports = { CodeGenerator };
