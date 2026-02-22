'use strict';

const { TYPE_INT, TYPE_STRING } = require('../types');

function emitObjNew(dest, keys, values) {
  // Object layout: [count (8)][keys ptr (8)][values ptr (8)] = 24 bytes header
  // keys = array of string pointers, values = array of qwords
  this.comment('object literal');
  const count = keys.length;
  this.instr('push rbx');
  this.instr('push r12');
  // Allocate header
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 24');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr(`mov qword [rbx], ${count}`);
  // Allocate keys array
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${count * 8}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+8], rax');
  this.instr('mov r12, rax');
  // Store key pointers (string labels)
  for (let i = 0; i < count; i++) {
    this.instr(`lea rax, [${keys[i]}]`);
    this.instr(`mov [r12+${i * 8}], rax`);
  }
  // Allocate values array
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${count * 8}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  this.instr('mov r12, rax');
  // Store values
  for (let i = 0; i < count; i++) {
    this.instr(`mov rax, ${this.loc(values[i])}`);
    this.instr(`mov [r12+${i * 8}], rax`);
  }
  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjGet(dest, obj, keyLabel) {
  // Linear search: compare each key with strcmp
  this.comment(`obj.get("${keyLabel}")`);
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr(`mov rbx, ${this.loc(obj)}`);   // rbx = header
  this.instr('mov r12, [rbx]');              // r12 = count
  this.instr('mov r13, [rbx+8]');            // r13 = keys ptr
  this.instr('mov r14, [rbx+16]');           // r14 = values ptr
  this.instr('xor rcx, rcx');                // rcx = index
  const loopLbl = this.newLabel('objget_loop');
  const foundLbl = this.newLabel('objget_found');
  const endLbl = this.newLabel('objget_end');
  this.label(loopLbl);
  this.instr('cmp rcx, r12');
  this.instr(`jge ${endLbl}`);
  this.instr('push rcx');                    // save index
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [r13+rcx*8]');        // key[i]
  this.instr(`lea rdx, [${keyLabel}]`);
  this.instr('call strcmp');
  this.instr('add rsp, 32');
  this.instr('pop rcx');
  this.instr('test eax, eax');
  this.instr(`jz ${foundLbl}`);
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  this.label(foundLbl);
  this.instr('mov rax, [r14+rcx*8]');        // values[i]
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr(`jmp ._cg_objget_done_${this._labelCounter}`);
  this.label(endLbl);
  // Key not found — return 0
  this.instr('xor rax, rax');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.label(`._cg_objget_done_${this._labelCounter++}`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjSet(obj, keyLabel, value) {
  // Linear search for existing key, or append
  this.comment(`obj.set("${keyLabel}")`)
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');                    // 6 pushes = 48 bytes → aligned
  this.instr(`mov rbx, ${this.loc(obj)}`);
  this.instr('mov r12, [rbx]');              // count
  this.instr('mov r13, [rbx+8]');            // keys ptr
  this.instr('mov r14, [rbx+16]');           // values ptr
  this.instr('xor rcx, rcx');
  const loopLbl = this.newLabel('objset_loop');
  const foundLbl = this.newLabel('objset_found');
  const appendLbl = this.newLabel('objset_append');
  const doneLbl = this.newLabel('objset_done');
  this.label(loopLbl);
  this.instr('cmp rcx, r12');
  this.instr(`jge ${appendLbl}`);
  this.instr('push rcx');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [r13+rcx*8]');
  this.instr(`lea rdx, [${keyLabel}]`);
  this.instr('call strcmp');
  this.instr('add rsp, 32');
  this.instr('pop rcx');
  this.instr('test eax, eax');
  this.instr(`jz ${foundLbl}`);
  this.instr('inc rcx');
  this.instr(`jmp ${loopLbl}`);
  // Found: update value
  this.label(foundLbl);
  this.instr(`mov rax, ${this.loc(value)}`);
  this.instr('mov [r14+rcx*8], rax');
  this.instr(`jmp ${doneLbl}`);
  // Not found: append (realloc keys and values arrays)
  this.label(appendLbl);
  this.instr('lea rdi, [r12+1]');            // new count
  this.instr('mov [rbx], rdi');
  // Realloc keys
  this.instr('shl rdi, 3');                  // newCount * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r13');                // old keys ptr
  this.instr('mov rdx, rdi');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+8], rax');
  this.instr('mov r13, rax');
  // Store new key
  this.instr(`lea rax, [${keyLabel}]`);
  this.instr('mov [r13+r12*8], rax');
  // Realloc values
  this.instr('mov rdi, [rbx]');
  this.instr('shl rdi, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r14');
  this.instr('mov rdx, rdi');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  this.instr('mov r14, rax');
  // Store new value
  this.instr(`mov rax, ${this.loc(value)}`);
  this.instr('mov [r14+r12*8], rax');
  this.label(doneLbl);
  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjSpread(destObj, srcObj) {
  // Copy all key-value pairs from src object to dest object
  // Loop: for i = 0; i < src.count; i++ { dest.set(src.keys[i], src.values[i]) }
  this.comment('object spread');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');  // 6 pushes = aligned

  this.instr(`mov rbx, ${this.loc(destObj)}`);   // dest header
  this.instr(`mov r12, ${this.loc(srcObj)}`);    // src header
  this.instr('mov r13, [r12]');                  // src count
  this.instr('mov r14, [r12+8]');               // src keys ptr
  this.instr('mov r15, [r12+16]');              // src values ptr
  this.instr('xor rdi, rdi');                    // i = 0

  const loopLabel = this.newLabel('objspread_loop');
  const endLabel = this.newLabel('objspread_end');

  this.label(loopLabel);
  this.instr('cmp rdi, r13');
  this.instr(`jge ${endLabel}`);

  // For each key-value pair, we need to call OBJ_SET-like logic
  // Realloc dest keys and values, then append
  // Simpler: use existing OBJ_SET by doing the strcmp loop inline
  // Even simpler: just append directly (assume no duplicates for spread)
  this.instr('push rdi');  // save i
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');  // 4 pushes = aligned

  // Get current dest count and expand
  this.instr('mov rcx, [rbx]');                  // dest count
  this.instr('lea rdx, [rcx+1]');               // new count
  this.instr('mov [rbx], rdx');                  // update count

  // Realloc dest keys
  this.instr('shl rdx, 3');                     // newCount * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+8]');              // old keys ptr
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+8], rax');

  // Store src key[i] into dest keys[oldCount]
  this.instr('mov rcx, [rbx]');
  this.instr('dec rcx');                        // oldCount = newCount - 1
  this.instr('mov rdx, [r14+rdi*8]');           // src keys[i]
  this.instr('mov [rax+rcx*8], rdx');

  // Realloc dest values
  this.instr('mov rdx, [rbx]');
  this.instr('shl rdx, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Store src values[i] into dest values[oldCount]
  this.instr('mov rcx, [rbx]');
  this.instr('dec rcx');
  this.instr('mov rdx, [r15+rdi*8]');
  this.instr('mov [rax+rcx*8], rdx');

  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop rdi');

  this.instr('inc rdi');
  this.instr(`jmp ${loopLabel}`);

  this.label(endLabel);
  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjKeys(dest, obj) {
  // Returns array of key strings
  this.comment('Object.keys()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(obj)}`);
  this.instr('mov r13, [r12]');           // count
  this.instr('mov r14, [r12+8]');         // keys ptr

  // Allocate array header (32 bytes)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov [rbx], r13');           // length = count
  this.instr('mov [rbx+8], r13');         // capacity = count

  // Allocate data
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz1 = this.newLabel('okeys_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Copy key pointers: memcpy(data, keysPtr, count*8)
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r14');
  this.instr('mov r8, r13');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Allocate types (all TYPE_STRING = 5)
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('okeys_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // Fill types with TYPE_STRING
  this.instr('xor rcx, rcx');
  const typLoop = this.newLabel('okeys_tl');
  const typEnd = this.newLabel('okeys_te');
  this.label(typLoop);
  this.instr('cmp rcx, r13');
  this.instr(`jge ${typEnd}`);
  this.instr('mov rdx, [rbx+24]');
  this.instr(`mov byte [rdx+rcx], ${TYPE_STRING}`);
  this.instr('inc rcx');
  this.instr(`jmp ${typLoop}`);
  this.label(typEnd);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjValues(dest, obj) {
  this.comment('Object.values()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(obj)}`);
  this.instr('mov r13, [r12]');           // count
  this.instr('mov r14, [r12+16]');        // values ptr

  // Allocate array header
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov [rbx], r13');
  this.instr('mov [rbx+8], r13');

  // Allocate data
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz1 = this.newLabel('ovals_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Copy values: memcpy(data, valuesPtr, count*8)
  this.instr('mov rcx, rax');
  this.instr('mov rdx, r14');
  this.instr('mov r8, r13');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Allocate types (default to TYPE_INT)
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('ovals_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');
  // Fill types with TYPE_INT (3)
  this.instr('xor rcx, rcx');
  const typLoop = this.newLabel('ovals_tl');
  const typEnd = this.newLabel('ovals_te');
  this.label(typLoop);
  this.instr('cmp rcx, r13');
  this.instr(`jge ${typEnd}`);
  this.instr('mov rdx, [rbx+24]');
  this.instr(`mov byte [rdx+rcx], ${TYPE_INT}`);
  this.instr('inc rcx');
  this.instr(`jmp ${typLoop}`);
  this.label(typEnd);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitObjEntries(dest, obj) {
  // Returns array of [key, value] pairs - simplified: returns array of keys for now
  this.comment('Object.entries() - simplified');
  // For now, return Object.keys() as placeholder
  emitObjKeys.call(this, dest, obj);
}

function emitObjHasOwn(dest, obj, keyLabel) {
  this.comment('obj.hasOwnProperty()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov rbx, ${this.loc(obj)}`);
  this.instr('mov r12, [rbx]');           // count
  this.instr('mov r13, [rbx+8]');         // keys ptr
  this.instr('xor r14, r14');             // i = 0

  const loopLbl = this.newLabel('ohas_loop');
  const foundLbl = this.newLabel('ohas_found');
  const notFoundLbl = this.newLabel('ohas_nf');
  const doneLbl = this.newLabel('ohas_done');

  this.label(loopLbl);
  this.instr('cmp r14, r12');
  this.instr(`jge ${notFoundLbl}`);
  this.instr('push r14');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [r13+r14*8]');
  this.instr(`lea rdx, [${keyLabel}]`);
  this.instr('call strcmp');
  this.instr('add rsp, 32');
  this.instr('pop r14');
  this.instr('test eax, eax');
  this.instr(`jz ${foundLbl}`);
  this.instr('inc r14');
  this.instr(`jmp ${loopLbl}`);

  this.label(foundLbl);
  this.instr('mov rax, 1');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr(`jmp ${doneLbl}`);

  this.label(notFoundLbl);
  this.instr('xor rax, rax');
  this.instr(`mov ${this.loc(dest)}, rax`);

  this.label(doneLbl);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

module.exports = {
  emitObjNew,
  emitObjGet,
  emitObjSet,
  emitObjSpread,
  emitObjKeys,
  emitObjValues,
  emitObjEntries,
  emitObjHasOwn,
};
