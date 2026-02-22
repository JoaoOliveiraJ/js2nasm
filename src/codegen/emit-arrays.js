'use strict';

const { TYPE_INT, TYPE_STRING } = require('../types');

function emitArrayNew(dest, elements) {
  // Array struct: [length (8)][capacity (8)][data ptr (8)][types ptr (8)]
  // = 32 bytes header (types_ptr stores per-element type IDs)
  const count = elements.length;
  const capacity = Math.max(count, 8);

  // Allocate header (32 bytes)
  this.instr('push rbx');    // save callee-saved
  this.instr('push r12');   // padding for 16-byte alignment
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax'); // header ptr

  // Set length
  this.instr(`mov qword [rbx], ${count}`);
  // Set capacity
  this.instr(`mov qword [rbx+8], ${capacity}`);

  // Allocate data (capacity * 8 bytes)
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${capacity * 8}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax'); // data ptr

  // Store elements
  for (let i = 0; i < elements.length; i++) {
    this.instr(`mov rcx, ${this.loc(elements[i].temp)}`);
    this.instr(`mov [rax+${i * 8}], rcx`);
  }

  // Allocate types array (capacity bytes)
  this.instr('sub rsp, 32');
  this.instr(`mov rcx, ${capacity}`);
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax'); // types ptr

  // Store type bytes
  for (let i = 0; i < elements.length; i++) {
    const typeId = elements[i].type || TYPE_INT;
    this.instr(`mov byte [rax+${i}], ${typeId}`);
  }

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayGet(dest, array, index) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax+16]'); // data ptr
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr('mov rax, [rax+rcx*8]');
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitArraySet(array, index, value) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax+16]'); // data ptr
  this.instr(`mov rcx, ${this.loc(index)}`);
  this.instr(`mov rdx, ${this.loc(value)}`);
  this.instr('mov [rax+rcx*8], rdx');
}

function emitArrayPush(array, value, type) {
  // arr.data[arr.length] = value; arr.length++
  // With capacity expansion: if length == capacity, realloc to 2x
  const typeId = type || TYPE_INT;
  const skipRealloc = this.newLabel('arr_push_ok');

  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);  // rbx = header ptr
  this.instr('mov rcx, [rbx]');               // rcx = length
  this.instr('mov rdx, [rbx+8]');             // rdx = capacity
  this.instr('cmp rcx, rdx');
  this.instr(`jl ${skipRealloc}`);

  // Expand: new capacity = old * 2
  this.instr('shl rdx, 1');                   // rdx = capacity * 2
  this.instr('mov [rbx+8], rdx');             // update capacity
  this.instr('mov r12, rdx');                 // save new capacity

  // malloc(newCapacity * 8)
  this.instr('shl rdx, 3');                   // rdx = newCapacity * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rdx');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov r12, rax');                 // r12 = new buf ptr (save it)

  // memcpy(newBuf, oldBuf, length * 8)
  this.instr('mov r8, [rbx]');                // length
  this.instr('shl r8, 3');                    // length * 8
  this.instr('sub rsp, 32');
  this.instr('mov rcx, r12');                 // dest = new buf
  this.instr('mov rdx, [rbx+16]');            // src = old buf
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // Free old data buffer
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call free');
  this.instr('add rsp, 32');

  // Update data ptr (use saved r12, not rax which free clobbered)
  this.instr('mov [rbx+16], r12');

  // Realloc types array
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');            // old types ptr
  this.instr('mov rdx, [rbx+8]');             // new capacity
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');            // update types ptr

  this.label(skipRealloc);
  // Now do the push
  this.instr('mov rcx, [rbx]');               // length (= index for new elem)
  this.instr('mov rdx, [rbx+16]');            // data ptr
  this.instr(`mov r8, ${this.loc(value)}`);
  this.instr('mov [rdx+rcx*8], r8');
  // Store type byte
  this.instr('mov rdx, [rbx+24]');            // types ptr
  this.instr(`mov byte [rdx+rcx], ${typeId}`);
  this.instr('inc qword [rbx]');              // length++

  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayLength(dest, array) {
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rax, [rax]'); // length field
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitTemplate(dest, parts) {
  if (parts.length === 0) {
    this.emitLoadString(dest, '""');
    return;
  }

  if (parts.length === 1) {
    if (parts[0].type === TYPE_STRING) {
      this.instr(`mov rax, ${this.loc(parts[0].temp)}`);
      this.instr(`mov ${this.loc(dest)}, rax`);
    } else {
      this.instr('sub rsp, 32');
      this.instr(`mov rcx, ${this.loc(parts[0].temp)}`);
      this.instr('call __int_to_str');
      this.instr('add rsp, 32');
      this.instr(`mov ${this.loc(dest)}, rax`);
    }
    return;
  }

  // For multiple parts: build string by concatenating
  // Start with first part
  let currentTemp;
  if (parts[0].type === TYPE_STRING) {
    currentTemp = parts[0].temp;
  } else {
    // Convert to string
    currentTemp = dest; // reuse dest temporarily
    this.instr('sub rsp, 32');
    this.instr(`mov rcx, ${this.loc(parts[0].temp)}`);
    this.instr('call __int_to_str');
    this.instr('add rsp, 32');
    this.instr(`mov ${this.loc(currentTemp)}, rax`);
  }

  // Concatenate remaining parts
  for (let i = 1; i < parts.length; i++) {
    const rightType = parts[i].type;
    this.emitStrConcat(dest, currentTemp, parts[i].temp,
      TYPE_STRING, rightType);
    currentTemp = dest;
  }
}

function emitArraySpread(destArray, srcArray) {
  // Copy all elements from srcArray into destArray using ARRAY_PUSH logic
  // Loop: for i = 0; i < src.length; i++ { dest.push(src[i]) }
  this.comment('array spread');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov rbx, ${this.loc(destArray)}`);   // rbx = dest header
  this.instr(`mov r12, ${this.loc(srcArray)}`);     // r12 = src header
  this.instr('mov r13, [r12]');                     // r13 = src.length
  this.instr('xor r14, r14');                       // r14 = i = 0

  const loopLabel = this.newLabel('arrspread_loop');
  const endLabel = this.newLabel('arrspread_end');

  this.label(loopLabel);
  this.instr('cmp r14, r13');
  this.instr(`jge ${endLabel}`);

  // Get src[i]
  this.instr('mov rax, [r12+16]');                  // src data ptr
  this.instr('mov rcx, [rax+r14*8]');               // src[i] value
  // Get src type[i]
  this.instr('mov rax, [r12+24]');                  // src types ptr
  this.instr('movzx edx, byte [rax+r14]');          // src type[i]

  // Push to dest: check capacity first
  this.instr('mov rax, [rbx]');                     // dest.length
  this.instr('cmp rax, [rbx+8]');                   // cmp with capacity
  const skipRealloc = this.newLabel('arrspread_ok');
  this.instr(`jl ${skipRealloc}`);

  // Need to expand - save rcx, rdx (value/type)
  this.instr('push rcx');
  this.instr('push rdx');
  // Double capacity
  this.instr('mov rax, [rbx+8]');
  this.instr('shl rax, 1');
  this.instr('mov [rbx+8], rax');
  // malloc new data
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('push rax');  // save new buf
  // memcpy
  this.instr('mov r8, [rbx]');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('mov rdx, [rbx+16]');
  this.instr('call memcpy');
  this.instr('add rsp, 32');
  // free old
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call free');
  this.instr('add rsp, 32');
  this.instr('pop rax');
  this.instr('mov [rbx+16], rax');
  // realloc types
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [rbx+8]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');
  this.instr('pop rdx');
  this.instr('pop rcx');

  this.label(skipRealloc);
  // Store value
  this.instr('mov rax, [rbx]');                     // dest.length
  this.instr('mov r8, [rbx+16]');                   // dest data ptr
  this.instr('mov [r8+rax*8], rcx');                // data[length] = value
  this.instr('mov r8, [rbx+24]');                   // dest types ptr
  this.instr('mov byte [r8+rax], dl');              // types[length] = type
  this.instr('inc qword [rbx]');                    // dest.length++

  this.instr('inc r14');
  this.instr(`jmp ${loopLabel}`);

  this.label(endLabel);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitCallSpread(dest, funcName, normalArgs, spreadArray) {
  // Simple approach: iterate the spread array and build a flat arg list
  // For now, support spread as the last argument only
  this.comment(`call ${funcName} with spread`);

  // Push callee-saved registers
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');  // 6 pushes = aligned

  // Load spread array info
  this.instr(`mov rbx, ${this.loc(spreadArray)}`);  // array header
  this.instr('mov r12, [rbx]');                      // spread length
  this.instr('mov r13, [rbx+16]');                   // spread data ptr

  // Total args = normalArgs.length + spread length
  const normalCount = normalArgs.length;
  this.instr(`mov r14, ${normalCount}`);
  this.instr('add r14, r12');                        // r14 = total arg count

  // Calculate extra stack space needed for args > 4
  // We need to push spread args onto the stack (right to left)
  // First, push all spread args right to left, then normal args > 4 right to left
  // Then load first 4 into registers

  // Calculate how many extra stack args: max(0, totalArgs - 4)
  this.instr('mov r15, r14');
  this.instr('sub r15, 4');
  this.instr('xor rdi, rdi');
  this.instr('cmp r15, 0');
  const noExtraLabel = this.newLabel('callspread_noextra');
  this.instr(`jle ${noExtraLabel}`);
  // Align stack: if odd number of extra args, add padding
  this.instr('test r15, 1');
  const alignedLabel = this.newLabel('callspread_aligned');
  this.instr(`jz ${alignedLabel}`);
  this.instr('sub rsp, 8');
  this.instr('add rdi, 8');
  this.label(alignedLabel);

  // Push spread args in reverse (those that go on stack, i.e., index >= 4 - normalCount)
  // Actually let's simplify: push ALL spread args right to left, then push normal args > 4
  // Then we'll load first 4 from what we pushed. No — that's complex.
  // Simpler: push spread right-to-left
  this.instr('mov rcx, r12');
  this.instr('dec rcx');
  const pushSpreadLoop = this.newLabel('callspread_pushloop');
  const pushSpreadDone = this.newLabel('callspread_pushdone');
  this.label(pushSpreadLoop);
  this.instr('cmp rcx, 0');
  this.instr(`jl ${pushSpreadDone}`);
  // Only push if this arg index (normalCount + rcx) >= 4
  this.instr('mov rax, rcx');
  this.instr(`add rax, ${normalCount}`);
  this.instr('cmp rax, 4');
  const skipPushLabel = this.newLabel('callspread_skippush');
  this.instr(`jl ${skipPushLabel}`);
  this.instr('push qword [r13+rcx*8]');
  this.instr('add rdi, 8');
  this.label(skipPushLabel);
  this.instr('dec rcx');
  this.instr(`jmp ${pushSpreadLoop}`);
  this.label(pushSpreadDone);

  this.label(noExtraLabel);

  // Now set up first 4 args from normal + spread
  const paramRegs = ['rcx', 'rdx', 'r8', 'r9'];
  // Set all to UNDEF_SENTINEL first
  for (let i = 0; i < 4; i++) {
    this.instr(`mov ${paramRegs[i]}, UNDEF_SENTINEL`);
  }
  // Load normal args
  for (let i = 0; i < normalCount && i < 4; i++) {
    this.instr(`mov ${paramRegs[i]}, ${this.loc(normalArgs[i].temp)}`);
  }
  // Load spread args into remaining registers (if any)
  for (let i = normalCount; i < 4; i++) {
    const spreadIdx = i - normalCount;
    this.instr(`cmp r12, ${spreadIdx + 1}`);  // check if spread has this many elements
    const skipLoadLabel = this.newLabel('callspread_skipload');
    this.instr(`jl ${skipLoadLabel}`);
    this.instr(`mov ${paramRegs[i]}, [r13+${spreadIdx * 8}]`);
    this.label(skipLoadLabel);
  }

  // Shadow space + call
  this.instr('sub rsp, 32');
  this.instr(`call func_${funcName}`);
  this.instr('add rsp, 32');
  this.instr('add rsp, rdi');  // clean up extra args

  this.instr(`mov ${this.loc(dest)}, rax`);

  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayPop(dest, array) {
  this.comment('array.pop()');
  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr('mov rcx, [rax]');           // length
  this.instr('dec rcx');                   // new length
  this.instr('mov [rax], rcx');           // update length
  this.instr('mov rdx, [rax+16]');        // data ptr
  this.instr('mov rax, [rdx+rcx*8]');     // data[newLength]
  this.instr(`mov ${this.loc(dest)}, rax`);
}

function emitArrayShift(dest, array) {
  this.comment('array.shift()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov rax, [rbx+16]');        // data ptr
  this.instr('mov rcx, [rax]');           // first element
  this.instr(`mov ${this.loc(dest)}, rcx`);
  // Shift data left: memmove(data, data+8, (length-1)*8)
  this.instr('mov r12, [rbx]');
  this.instr('dec r12');
  this.instr('mov [rbx], r12');           // new length
  this.instr('mov rcx, [rbx+16]');        // dest = data
  this.instr('lea rdx, [rcx+8]');         // src = data+8
  this.instr('mov r8, r12');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Shift types left
  this.instr('mov rcx, [rbx+24]');
  this.instr('lea rdx, [rcx+1]');
  this.instr('mov r8, r12');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayUnshift(array, value, type) {
  this.comment('array.unshift()');
  const typeId = type || TYPE_INT;
  const skipRealloc = this.newLabel('unshift_ok');

  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov rcx, [rbx]');
  this.instr('cmp rcx, [rbx+8]');
  this.instr(`jl ${skipRealloc}`);
  // Expand
  this.instr('mov rdx, [rbx+8]');
  this.instr('shl rdx, 1');
  this.instr('mov [rbx+8], rdx');
  this.instr('shl rdx, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+16]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [rbx+8]');
  this.instr('call realloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  this.label(skipRealloc);
  // Shift data right: memmove(data+8, data, length*8)
  this.instr('mov r12, [rbx]');
  this.instr('mov rdx, [rbx+16]');        // src = data
  this.instr('lea rcx, [rdx+8]');         // dest = data+8
  this.instr('mov r8, r12');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Shift types right
  this.instr('mov rdx, [rbx+24]');
  this.instr('lea rcx, [rdx+1]');
  this.instr('mov r8, r12');
  this.instr('sub rsp, 32');
  this.instr('call memmove');
  this.instr('add rsp, 32');
  // Set first element
  this.instr('mov rax, [rbx+16]');
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('mov [rax], rcx');
  this.instr('mov rax, [rbx+24]');
  this.instr(`mov byte [rax], ${typeId}`);
  this.instr('inc qword [rbx]');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayIndexOf(dest, array, value) {
  this.comment('array.indexOf()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov r12, [rbx]');           // length
  this.instr('mov rbx, [rbx+16]');        // data ptr
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('xor rdx, rdx');             // i = 0
  const loopLbl = this.newLabel('aidxof_loop');
  const foundLbl = this.newLabel('aidxof_found');
  const notFoundLbl = this.newLabel('aidxof_nf');
  const doneLbl = this.newLabel('aidxof_done');
  this.label(loopLbl);
  this.instr('cmp rdx, r12');
  this.instr(`jge ${notFoundLbl}`);
  this.instr('cmp [rbx+rdx*8], rcx');
  this.instr(`je ${foundLbl}`);
  this.instr('inc rdx');
  this.instr(`jmp ${loopLbl}`);
  this.label(foundLbl);
  this.instr(`mov ${this.loc(dest)}, rdx`);
  this.instr(`jmp ${doneLbl}`);
  this.label(notFoundLbl);
  this.instr('mov rax, -1');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.label(doneLbl);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayIncludes(dest, array, value) {
  this.comment('array.includes()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr(`mov rbx, ${this.loc(array)}`);
  this.instr('mov r12, [rbx]');
  this.instr('mov rbx, [rbx+16]');
  this.instr(`mov rcx, ${this.loc(value)}`);
  this.instr('xor rdx, rdx');
  const loopLbl = this.newLabel('ainc_loop');
  const foundLbl = this.newLabel('ainc_found');
  const notFoundLbl = this.newLabel('ainc_nf');
  const doneLbl = this.newLabel('ainc_done');
  this.label(loopLbl);
  this.instr('cmp rdx, r12');
  this.instr(`jge ${notFoundLbl}`);
  this.instr('cmp [rbx+rdx*8], rcx');
  this.instr(`je ${foundLbl}`);
  this.instr('inc rdx');
  this.instr(`jmp ${loopLbl}`);
  this.label(foundLbl);
  this.instr('mov rax, 1');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.instr(`jmp ${doneLbl}`);
  this.label(notFoundLbl);
  this.instr('xor rax, rax');
  this.instr(`mov ${this.loc(dest)}, rax`);
  this.label(doneLbl);
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayJoin(dest, array, separator) {
  this.comment('array.join()');
  // 8 pushes = 64 bytes = aligned
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');
  this.instr('push r15');
  this.instr('push rdi');
  this.instr('push rsi');
  this.instr('sub rsp, 8');              // alignment padding (7 pushes + pad = 64)

  this.instr(`mov rax, ${this.loc(array)}`);
  this.instr(`mov r13, ${this.loc(separator)}`);
  this.instr('mov r14, [rax]');           // length
  this.instr('mov r15, [rax+16]');        // data ptr
  this.instr('mov rdi, [rax+24]');        // types ptr

  // Allocate result buffer (4096)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 4096');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov byte [rbx], 0');

  this.instr('xor r12, r12');             // i = 0
  const loopLbl = this.newLabel('ajoin_loop');
  const endLbl = this.newLabel('ajoin_end');
  const skipSepLbl = this.newLabel('ajoin_nosep');
  const isStrLbl = this.newLabel('ajoin_str');
  const appendLbl = this.newLabel('ajoin_append');

  this.label(loopLbl);
  this.instr('cmp r12, r14');
  this.instr(`jge ${endLbl}`);

  // Add separator if not first element
  this.instr('test r12, r12');
  this.instr(`jz ${skipSepLbl}`);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');             // dest = buf
  this.instr('mov rdx, r13');             // src = separator
  this.instr('call strcat');
  this.instr('add rsp, 32');
  this.label(skipSepLbl);

  // Get element as string → rsi
  this.instr('movzx eax, byte [rdi+r12]');
  this.instr(`cmp al, ${TYPE_STRING}`);
  this.instr(`je ${isStrLbl}`);
  // Convert int to string
  this.instr('sub rsp, 32');
  this.instr('mov rcx, [r15+r12*8]');
  this.instr('call __int_to_str');
  this.instr('add rsp, 32');
  this.instr('mov rsi, rax');
  this.instr(`jmp ${appendLbl}`);
  this.label(isStrLbl);
  this.instr('mov rsi, [r15+r12*8]');
  this.label(appendLbl);

  // Append element string: strcat(buf, rsi)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rbx');
  this.instr('mov rdx, rsi');
  this.instr('call strcat');
  this.instr('add rsp, 32');

  this.instr('inc r12');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('add rsp, 8');              // remove alignment padding
  this.instr('pop rsi');
  this.instr('pop rdi');
  this.instr('pop r15');
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArraySlice(dest, array, start, end) {
  this.comment('array.slice()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(array)}`);    // header
  this.instr(`mov r13, ${this.loc(start)}`);     // start index
  this.instr(`mov r14, ${this.loc(end)}`);       // end index

  // Handle negative start
  this.instr('test r13, r13');
  const startOk = this.newLabel('slc_sok');
  this.instr(`jge ${startOk}`);
  this.instr('add r13, [r12]');           // start += length
  this.label(startOk);
  // Handle negative end
  this.instr('test r14, r14');
  const endOk = this.newLabel('slc_eok');
  this.instr(`jge ${endOk}`);
  this.instr('add r14, [r12]');
  this.label(endOk);

  // count = end - start
  this.instr('mov rcx, r14');
  this.instr('sub rcx, r13');             // rcx = count
  // Clamp to >= 0
  this.instr('test rcx, rcx');
  const countOk = this.newLabel('slc_cok');
  this.instr(`jg ${countOk}`);
  this.instr('xor rcx, rcx');
  this.label(countOk);
  this.instr('push rcx');                 // save count

  // Allocate new array header (32 bytes)
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('pop rcx');                  // restore count
  this.instr('push rcx');
  this.instr('mov [rbx], rcx');           // length = count
  this.instr('mov rax, rcx');
  this.instr('test rax, rax');
  const nonZero = this.newLabel('slc_nz');
  this.instr(`jnz ${nonZero}`);
  this.instr('mov rax, 1');               // at least 1 for malloc
  this.label(nonZero);
  this.instr('mov [rbx+8], rax');         // capacity = count (or 1)

  // Allocate data
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Allocate types
  this.instr('pop rcx');                  // count
  this.instr('push rcx');
  this.instr('test rcx, rcx');
  const typNz = this.newLabel('slc_tnz');
  this.instr(`jnz ${typNz}`);
  this.instr('mov rcx, 1');
  this.label(typNz);
  this.instr('sub rsp, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // memcpy data: dest=newData, src=oldData+start*8, count*8
  this.instr('pop rcx');                  // count
  this.instr('push rcx');
  this.instr('mov r8, rcx');
  this.instr('shl r8, 3');
  this.instr('mov rcx, [rbx+16]');        // dest
  this.instr('mov rdx, [r12+16]');        // src base
  this.instr('lea rdx, [rdx+r13*8]');     // src + start*8
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy types: dest=newTypes, src=oldTypes+start, count
  this.instr('pop rcx');
  this.instr('mov r8, rcx');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [r12+24]');
  this.instr('add rdx, r13');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayReverse(dest, array) {
  this.comment('array.reverse()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(array)}`);
  this.instr('mov r13, [r12]');           // length

  // Allocate new array header
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
  const nz1 = this.newLabel('rev_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Allocate types
  this.instr('mov rax, r13');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('rev_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // Copy elements in reverse
  this.instr('xor r14, r14');             // i = 0
  const loopLbl = this.newLabel('rev_loop');
  const endLbl = this.newLabel('rev_end');
  this.label(loopLbl);
  this.instr('cmp r14, r13');
  this.instr(`jge ${endLbl}`);
  // src index = length - 1 - i
  this.instr('mov rax, r13');
  this.instr('dec rax');
  this.instr('sub rax, r14');
  // Copy data
  this.instr('mov rcx, [r12+16]');
  this.instr('mov rcx, [rcx+rax*8]');
  this.instr('mov rdx, [rbx+16]');
  this.instr('mov [rdx+r14*8], rcx');
  // Copy type
  this.instr('mov rcx, [r12+24]');
  this.instr('movzx ecx, byte [rcx+rax]');
  this.instr('mov rdx, [rbx+24]');
  this.instr('mov [rdx+r14], cl');
  this.instr('inc r14');
  this.instr(`jmp ${loopLbl}`);
  this.label(endLbl);

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

function emitArrayConcat(dest, arr1, arr2) {
  this.comment('array.concat()');
  this.instr('push rbx');
  this.instr('push r12');
  this.instr('push r13');
  this.instr('push r14');

  this.instr(`mov r12, ${this.loc(arr1)}`);
  this.instr(`mov r13, ${this.loc(arr2)}`);
  this.instr('mov r14, [r12]');
  this.instr('add r14, [r13]');           // total length

  // Allocate header
  this.instr('sub rsp, 32');
  this.instr('mov rcx, 32');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov rbx, rax');
  this.instr('mov [rbx], r14');
  this.instr('mov [rbx+8], r14');

  // Allocate data
  this.instr('mov rax, r14');
  this.instr('test rax, rax');
  const nz1 = this.newLabel('cat_nz1');
  this.instr(`jnz ${nz1}`);
  this.instr('mov rax, 1');
  this.label(nz1);
  this.instr('shl rax, 3');
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+16], rax');

  // Allocate types
  this.instr('mov rax, r14');
  this.instr('test rax, rax');
  const nz2 = this.newLabel('cat_nz2');
  this.instr(`jnz ${nz2}`);
  this.instr('mov rax, 1');
  this.label(nz2);
  this.instr('sub rsp, 32');
  this.instr('mov rcx, rax');
  this.instr('call malloc');
  this.instr('add rsp, 32');
  this.instr('mov [rbx+24], rax');

  // memcpy arr1 data
  this.instr('mov r8, [r12]');
  this.instr('shl r8, 3');
  this.instr('mov rcx, [rbx+16]');
  this.instr('mov rdx, [r12+16]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy arr2 data after arr1
  this.instr('mov rax, [r12]');
  this.instr('mov rcx, [rbx+16]');
  this.instr('lea rcx, [rcx+rax*8]');     // dest = newData + len1*8
  this.instr('mov rdx, [r13+16]');
  this.instr('mov r8, [r13]');
  this.instr('shl r8, 3');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy arr1 types
  this.instr('mov r8, [r12]');
  this.instr('mov rcx, [rbx+24]');
  this.instr('mov rdx, [r12+24]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  // memcpy arr2 types
  this.instr('mov rax, [r12]');
  this.instr('mov rcx, [rbx+24]');
  this.instr('add rcx, rax');
  this.instr('mov rdx, [r13+24]');
  this.instr('mov r8, [r13]');
  this.instr('sub rsp, 32');
  this.instr('call memcpy');
  this.instr('add rsp, 32');

  this.instr(`mov ${this.loc(dest)}, rbx`);
  this.instr('pop r14');
  this.instr('pop r13');
  this.instr('pop r12');
  this.instr('pop rbx');
}

module.exports = {
  emitArrayNew,
  emitArrayGet,
  emitArraySet,
  emitArrayPush,
  emitArrayLength,
  emitTemplate,
  emitArraySpread,
  emitCallSpread,
  emitArrayPop,
  emitArrayShift,
  emitArrayUnshift,
  emitArrayIndexOf,
  emitArrayIncludes,
  emitArrayJoin,
  emitArraySlice,
  emitArrayReverse,
  emitArrayConcat,
};
