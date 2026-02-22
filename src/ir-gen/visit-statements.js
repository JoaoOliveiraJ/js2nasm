'use strict';

const { OP } = require('../ir');
const { TYPE_INT, TYPE_ARRAY } = require('../types');

function visitVariableDeclaration(node) {
  for (const decl of node.declarations) {
    const isConst = node.kind === 'const';

    // Array destructuring: const [a, b] = expr
    if (decl.id.type === 'ArrayPattern') {
      const { temp: arrTemp } = this.visitExpression(decl.init);
      for (let i = 0; i < decl.id.elements.length; i++) {
        const elem = decl.id.elements[i];
        if (!elem) continue; // skip holes

        // RestElement: const [a, ...rest] = arr
        if (elem.type === 'RestElement') {
          const restName = elem.argument.name;
          const name = (!this.inFunction && this.moduleId) ? this.qualifyName(restName) : restName;
          const startTemp = this.newTemp();
          this.emit(OP.LOAD_INT, startTemp, i);
          const lenTemp = this.newTemp();
          this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
          const restArr = this.newTemp();
          this.emit(OP.ARRAY_SLICE, restArr, arrTemp, startTemp, lenTemp);
          this.analyzer.currentScope.declare(restName, { type: TYPE_ARRAY, isConst, qualifiedName: name });
          if (!this.inFunction) this.program.globals.add(name);
          this.emit(OP.STORE_VAR, name, restArr);
          break; // rest must be last
        }

        // AssignmentPattern: const [a = defaultVal] = arr — check bounds first
        if (elem.type === 'AssignmentPattern') {
          const elemName = elem.left.name;
          const name = (!this.inFunction && this.moduleId) ? this.qualifyName(elemName) : elemName;
          this.analyzer.currentScope.declare(elemName, { type: TYPE_INT, isConst, qualifiedName: name });
          if (!this.inFunction) this.program.globals.add(name);
          // Check if index i is within array bounds
          const lenTemp = this.newTemp();
          this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
          const idxTemp = this.newTemp();
          this.emit(OP.LOAD_INT, idxTemp, i);
          const inBounds = this.newTemp();
          this.emit(OP.CMP_GT, inBounds, lenTemp, idxTemp);
          const useElemLabel = this.newLabel('arrdef_elem');
          const endDefLabel = this.newLabel('arrdef_end');
          this.emit(OP.JUMP_IF_TRUE, inBounds, useElemLabel);
          // Out of bounds: use default
          const { temp: defVal } = this.visitExpression(elem.right);
          this.emit(OP.STORE_VAR, name, defVal);
          this.emit(OP.JUMP, endDefLabel);
          // In bounds: use array element
          this.emit(OP.LABEL, useElemLabel);
          const valTemp = this.newTemp();
          this.emit(OP.ARRAY_GET, valTemp, arrTemp, idxTemp);
          this.emit(OP.STORE_VAR, name, valTemp);
          this.emit(OP.LABEL, endDefLabel);
          continue;
        }

        const idxTemp = this.newTemp();
        this.emit(OP.LOAD_INT, idxTemp, i);
        const valTemp = this.newTemp();
        this.emit(OP.ARRAY_GET, valTemp, arrTemp, idxTemp);

        // Nested array destructuring: const [a, [b, c]] = arr
        if (elem.type === 'ArrayPattern') {
          const tempName = `_nested_arr_${this.labelCounter++}`;
          this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
          this.emit(OP.STORE_VAR, tempName, valTemp);
          this._emitArrayDestructuringDecl(tempName, elem, isConst);
          continue;
        }

        // Nested object destructuring: const [{ x }] = arr
        if (elem.type === 'ObjectPattern') {
          const tempName = `_nested_obj_${this.labelCounter++}`;
          this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
          this.emit(OP.STORE_VAR, tempName, valTemp);
          this._emitObjectDestructuringDecl(tempName, elem, isConst);
          continue;
        }

        const elemName = elem.name;
        const name = (!this.inFunction && this.moduleId) ? this.qualifyName(elemName) : elemName;
        this.analyzer.currentScope.declare(elemName, { type: TYPE_INT, isConst, qualifiedName: name });
        if (!this.inFunction) this.program.globals.add(name);
        this.emit(OP.STORE_VAR, name, valTemp);
      }
      continue;
    }

    // Object destructuring: const { a, b } = expr
    if (decl.id.type === 'ObjectPattern') {
      const { temp: objTemp } = this.visitExpression(decl.init);
      for (const prop of decl.id.properties) {
        // RestElement: const { a, ...rest } = obj
        if (prop.type === 'RestElement') {
          // Not yet supported — skip
          continue;
        }

        const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
        const keyLabel = this.program.addString(keyName);
        const valTemp = this.newTemp();
        this.emit(OP.OBJ_GET, valTemp, objTemp, keyLabel);

        const target = prop.value || prop.key;

        // Default value: const { x = 10 } = obj — check key existence
        if (target.type === 'AssignmentPattern') {
          const localName = target.left.name;
          const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
          this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
          if (!this.inFunction) this.program.globals.add(name);
          // Check if key exists in object
          const hasKey = this.newTemp();
          this.emit(OP.OBJ_HAS_OWN, hasKey, objTemp, keyLabel);
          const useValLabel = this.newLabel('objdef_val');
          const endDefLabel = this.newLabel('objdef_end');
          this.emit(OP.JUMP_IF_TRUE, hasKey, useValLabel);
          // Key doesn't exist: use default
          const { temp: defVal } = this.visitExpression(target.right);
          this.emit(OP.STORE_VAR, name, defVal);
          this.emit(OP.JUMP, endDefLabel);
          // Key exists: use value from object
          this.emit(OP.LABEL, useValLabel);
          this.emit(OP.STORE_VAR, name, valTemp);
          this.emit(OP.LABEL, endDefLabel);
          continue;
        }

        // Nested object destructuring: const { a: { b } } = obj
        if (target.type === 'ObjectPattern') {
          const tempName = `_nested_obj_${this.labelCounter++}`;
          this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
          this.emit(OP.STORE_VAR, tempName, valTemp);
          this._emitObjectDestructuringDecl(tempName, target, isConst);
          continue;
        }

        // Nested array destructuring: const { a: [b, c] } = obj
        if (target.type === 'ArrayPattern') {
          const tempName = `_nested_arr_${this.labelCounter++}`;
          this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
          this.emit(OP.STORE_VAR, tempName, valTemp);
          this._emitArrayDestructuringDecl(tempName, target, isConst);
          continue;
        }

        const localName = target.type === 'Identifier' ? target.name : keyName;
        const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
        this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
        if (!this.inFunction) this.program.globals.add(name);
        this.emit(OP.STORE_VAR, name, valTemp);
      }
      continue;
    }

    const rawName = decl.id.name;

    // Qualify global variable names in module mode
    const name = (!this.inFunction && this.moduleId) ? this.qualifyName(rawName) : rawName;

    if (decl.init) {
      const exprResult = this.visitExpression(decl.init);
      const { temp, type } = exprResult;
      const declInfo = { type, isConst, qualifiedName: name };
      if (exprResult.propTypes) declInfo.propTypes = exprResult.propTypes;
      if (exprResult.elemTypes) declInfo.elemTypes = exprResult.elemTypes;
      if (exprResult.className) declInfo.className = exprResult.className;
      if (exprResult.funcName) declInfo.qualifiedName = exprResult.funcName;
      this.analyzer.currentScope.declare(rawName, declInfo);
      // Track global variables
      if (!this.inFunction) {
        this.program.globals.add(name);
      }
      this.emit(OP.STORE_VAR, name, temp);
    } else {
      this.analyzer.currentScope.declare(rawName, { type: TYPE_INT, isConst, qualifiedName: name });
      if (!this.inFunction) {
        this.program.globals.add(name);
      }
      const t = this.newTemp();
      this.emit(OP.LOAD_UNDEFINED, t);
      this.emit(OP.STORE_VAR, name, t);
    }
  }
}

function visitExpressionStatement(node) {
  const expr = node.expression;

  // Handle console.log specially
  if (expr.type === 'CallExpression' &&
      expr.callee.type === 'MemberExpression' &&
      expr.callee.object.type === 'Identifier' &&
      expr.callee.object.name === 'console' &&
      expr.callee.property.name === 'log') {
    return this.visitConsoleLog(expr);
  }

  // Handle console.error
  if (expr.type === 'CallExpression' &&
      expr.callee.type === 'MemberExpression' &&
      expr.callee.object.type === 'Identifier' &&
      expr.callee.object.name === 'console' &&
      expr.callee.property.name === 'error') {
    return this.visitConsoleError(expr);
  }

  // Handle process.exit()
  if (expr.type === 'CallExpression' &&
      expr.callee.type === 'MemberExpression' &&
      expr.callee.object.type === 'Identifier' &&
      expr.callee.object.name === 'process' &&
      expr.callee.property.name === 'exit') {
    return this.visitProcessExit(expr);
  }

  // Handle assignment expressions
  if (expr.type === 'AssignmentExpression') {
    return this.visitAssignment(expr);
  }

  // Handle update expressions (i++, i--)
  if (expr.type === 'UpdateExpression') {
    this.visitUpdateExpression(expr);
    return;
  }

  // General expression (e.g., function call)
  this.visitExpression(expr);
}

function visitConsoleLog(node) {
  const argInfos = [];
  for (const arg of node.arguments) {
    const { temp, type } = this.visitExpression(arg);
    argInfos.push({ temp, type });
  }
  this.emit(OP.CONSOLE_LOG, argInfos);
}

function visitConsoleError(node) {
  const argInfos = [];
  for (const arg of node.arguments) {
    const { temp, type } = this.visitExpression(arg);
    argInfos.push({ temp, type });
  }
  this.emit(OP.CONSOLE_ERROR, argInfos);
}

function visitProcessExit(node) {
  if (node.arguments.length > 0) {
    const { temp } = this.visitExpression(node.arguments[0]);
    this.emit(OP.PROCESS_EXIT, temp);
  } else {
    const t = this.newTemp();
    this.emit(OP.LOAD_INT, t, 0);
    this.emit(OP.PROCESS_EXIT, t);
  }
}

function visitAssignment(node) {
  if (node.left.type === 'Identifier') {
    const rawName = node.left.name;
    let name = rawName;
    // Resolve through importMap or qualified scope
    if (this.importMap.has(name)) {
      name = this.importMap.get(name);
    } else {
      const info = this.analyzer.currentScope.lookup(name);
      if (info && info.qualifiedName) {
        name = info.qualifiedName;
      }
    }

    // Enforce const
    const constInfo = this.analyzer.currentScope.lookup(rawName);
    if (constInfo && constInfo.isConst) {
      const line = node.loc ? node.loc.start.line : '?';
      throw new Error(`Assignment to constant variable '${rawName}' (line ${line})`);
    }

    if (node.operator === '=') {
      const result = this.visitExpression(node.right);
      const { temp, type } = result;
      this.emit(OP.STORE_VAR, name, temp);
      // Update className in analyzer if reassigning to a class instance
      if (result.className) {
        const info = this.analyzer.currentScope.lookup(rawName);
        if (info) info.className = result.className;
      }
      return { temp, type };
    }

    if (node.operator === '+=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.ADD, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    if (node.operator === '-=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.SUB, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    if (node.operator === '*=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.MUL, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    if (node.operator === '/=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.DIV, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    if (node.operator === '%=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.MOD, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    // Bitwise compound assignments: &=, |=, ^=, <<=, >>=, >>>=
    const bitwiseCompoundMap = {
      '&=': OP.BIT_AND, '|=': OP.BIT_OR, '^=': OP.BIT_XOR,
      '<<=': OP.SHL, '>>=': OP.SHR, '>>>=': OP.USHR,
    };
    if (bitwiseCompoundMap[node.operator]) {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(bitwiseCompoundMap[node.operator], result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    // **= (exponentiation assignment)
    if (node.operator === '**=') {
      const { temp: rightTemp } = this.visitExpression(node.right);
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      const result = this.newTemp();
      this.emit(OP.POW, result, t, rightTemp);
      this.emit(OP.STORE_VAR, name, result);
      return { temp: result, type: TYPE_INT };
    }

    // x &&= y — if x truthy, x = y
    if (node.operator === '&&=') {
      const skipLabel = this.newLabel('andassign_skip');
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      this.emit(OP.JUMP_IF_FALSE, t, skipLabel);
      const { temp: rightTemp } = this.visitExpression(node.right);
      this.emit(OP.STORE_VAR, name, rightTemp);
      this.emit(OP.LABEL, skipLabel);
      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, name);
      return { temp: result, type: TYPE_INT };
    }

    // x ||= y — if x falsy, x = y
    if (node.operator === '||=') {
      const skipLabel = this.newLabel('orassign_skip');
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      this.emit(OP.JUMP_IF_TRUE, t, skipLabel);
      const { temp: rightTemp } = this.visitExpression(node.right);
      this.emit(OP.STORE_VAR, name, rightTemp);
      this.emit(OP.LABEL, skipLabel);
      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, name);
      return { temp: result, type: TYPE_INT };
    }

    // x ??= y — if x falsy (nullish), x = y (same as ||= without type tags)
    if (node.operator === '??=') {
      const skipLabel = this.newLabel('ncassign_skip');
      const t = this.newTemp();
      this.emit(OP.LOAD_VAR, t, name);
      this.emit(OP.JUMP_IF_TRUE, t, skipLabel);
      const { temp: rightTemp } = this.visitExpression(node.right);
      this.emit(OP.STORE_VAR, name, rightTemp);
      this.emit(OP.LABEL, skipLabel);
      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, name);
      return { temp: result, type: TYPE_INT };
    }
  }

  // Array destructuring assignment: [a, b] = [b, a]
  if (node.left.type === 'ArrayPattern') {
    const { temp: arrTemp } = this.visitExpression(node.right);
    for (let i = 0; i < node.left.elements.length; i++) {
      const elem = node.left.elements[i];
      if (!elem) continue; // skip holes
      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, i);
      const valTemp = this.newTemp();
      this.emit(OP.ARRAY_GET, valTemp, arrTemp, idxTemp);

      if (elem.type === 'Identifier') {
        let name = elem.name;
        const info = this.analyzer.currentScope.lookup(name);
        if (info && info.qualifiedName) name = info.qualifiedName;
        this.emit(OP.STORE_VAR, name, valTemp);
      } else if (elem.type === 'MemberExpression') {
        // [obj.prop] = arr
        const { temp: objTemp } = this.visitExpression(elem.object);
        if (elem.computed) {
          const { temp: keyTemp } = this.visitExpression(elem.property);
          this.emit(OP.ARRAY_SET, objTemp, keyTemp, valTemp);
        } else {
          const keyLabel = this.program.addString(elem.property.name);
          this.emit(OP.OBJ_SET, objTemp, keyLabel, valTemp);
        }
      } else if (elem.type === 'AssignmentPattern') {
        // [a = defaultVal] = arr — check bounds
        let name = elem.left.name;
        const eInfo = this.analyzer.currentScope.lookup(name);
        if (eInfo && eInfo.qualifiedName) name = eInfo.qualifiedName;
        const lenTemp2 = this.newTemp();
        this.emit(OP.ARRAY_LENGTH, lenTemp2, arrTemp);
        const idxTemp2 = this.newTemp();
        this.emit(OP.LOAD_INT, idxTemp2, i);
        const inBounds = this.newTemp();
        this.emit(OP.CMP_GT, inBounds, lenTemp2, idxTemp2);
        const useElemLabel = this.newLabel('adef_elem');
        const endLabel = this.newLabel('adef_end');
        this.emit(OP.JUMP_IF_TRUE, inBounds, useElemLabel);
        const { temp: defVal } = this.visitExpression(elem.right);
        this.emit(OP.STORE_VAR, name, defVal);
        this.emit(OP.JUMP, endLabel);
        this.emit(OP.LABEL, useElemLabel);
        this.emit(OP.STORE_VAR, name, valTemp);
        this.emit(OP.LABEL, endLabel);
      } else if (elem.type === 'RestElement') {
        // [...rest] = arr — collect remaining elements
        const restName = elem.argument.name;
        const info = this.analyzer.currentScope.lookup(restName);
        let name = restName;
        if (info && info.qualifiedName) name = info.qualifiedName;
        const restArr = this.newTemp();
        const startTemp = this.newTemp();
        this.emit(OP.LOAD_INT, startTemp, i);
        const lenTemp = this.newTemp();
        this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
        this.emit(OP.ARRAY_SLICE, restArr, arrTemp, startTemp, lenTemp);
        this.emit(OP.STORE_VAR, name, restArr);
        break; // rest must be last
      }
    }
    return { temp: arrTemp, type: TYPE_ARRAY };
  }

  // Object destructuring assignment: ({x, y} = obj)
  if (node.left.type === 'ObjectPattern') {
    const { temp: objTemp } = this.visitExpression(node.right);
    for (const prop of node.left.properties) {
      if (prop.type === 'RestElement') {
        // {...rest} = obj — not implemented yet
        continue;
      }
      const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const keyLabel = this.program.addString(keyName);
      const valTemp = this.newTemp();
      this.emit(OP.OBJ_GET, valTemp, objTemp, keyLabel);

      const target = prop.value || prop.key;
      if (target.type === 'Identifier') {
        let name = target.name;
        const info = this.analyzer.currentScope.lookup(name);
        if (info && info.qualifiedName) name = info.qualifiedName;
        this.emit(OP.STORE_VAR, name, valTemp);
      } else if (target.type === 'AssignmentPattern') {
        // { x = defaultVal } = obj — check key existence
        let name = target.left.name;
        const oInfo = this.analyzer.currentScope.lookup(name);
        if (oInfo && oInfo.qualifiedName) name = oInfo.qualifiedName;
        const hasKey = this.newTemp();
        this.emit(OP.OBJ_HAS_OWN, hasKey, objTemp, keyLabel);
        const useValLabel = this.newLabel('odef_val');
        const endLabel = this.newLabel('odef_end');
        this.emit(OP.JUMP_IF_TRUE, hasKey, useValLabel);
        const { temp: defVal } = this.visitExpression(target.right);
        this.emit(OP.STORE_VAR, name, defVal);
        this.emit(OP.JUMP, endLabel);
        this.emit(OP.LABEL, useValLabel);
        this.emit(OP.STORE_VAR, name, valTemp);
        this.emit(OP.LABEL, endLabel);
      }
    }
    return { temp: objTemp, type: TYPE_INT };
  }

  // Member assignment: arr[i] = val, obj.prop = val, obj["key"] = val
  // Also handles compound: arr[i] += val, obj.prop -= val, etc.
  if (node.left.type === 'MemberExpression') {
    const { temp: objTemp } = this.visitExpression(node.left.object);
    const { temp: rightTemp } = this.visitExpression(node.right);

    // Determine the compound op (if any)
    const compoundOpMap = {
      '+=': OP.ADD, '-=': OP.SUB, '*=': OP.MUL, '/=': OP.DIV, '%=': OP.MOD,
      '**=': OP.POW, '&=': OP.BIT_AND, '|=': OP.BIT_OR, '^=': OP.BIT_XOR,
      '<<=': OP.SHL, '>>=': OP.SHR, '>>>=': OP.USHR,
    };

    // Helper: given old value + right, compute new value
    const computeVal = (oldTemp) => {
      if (node.operator === '=') return rightTemp;
      const compOp = compoundOpMap[node.operator];
      if (compOp) {
        const result = this.newTemp();
        this.emit(compOp, result, oldTemp, rightTemp);
        return result;
      }
      throw new Error(`Unsupported compound assignment: ${node.operator}`);
    };

    if (node.left.computed) {
      const prop = node.left.property;
      // String key → object get/set
      if (prop.type === 'Literal' && typeof prop.value === 'string') {
        const keyLabel = this.program.addString(prop.value);
        if (node.operator !== '=') {
          const oldTemp = this.newTemp();
          this.emit(OP.OBJ_GET, oldTemp, objTemp, keyLabel);
          const valTemp = computeVal(oldTemp);
          this.emit(OP.OBJ_SET, objTemp, keyLabel, valTemp);
          return { temp: valTemp, type: TYPE_INT };
        }
        this.emit(OP.OBJ_SET, objTemp, keyLabel, rightTemp);
        return { temp: rightTemp, type: TYPE_INT };
      }
      // Numeric → array get/set
      const { temp: idxTemp } = this.visitExpression(prop);
      if (node.operator !== '=') {
        const oldTemp = this.newTemp();
        this.emit(OP.ARRAY_GET, oldTemp, objTemp, idxTemp);
        const valTemp = computeVal(oldTemp);
        this.emit(OP.ARRAY_SET, objTemp, idxTemp, valTemp);
        return { temp: valTemp, type: TYPE_INT };
      }
      this.emit(OP.ARRAY_SET, objTemp, idxTemp, rightTemp);
      return { temp: rightTemp, type: TYPE_INT };
    }

    // Non-computed: obj.prop
    if (node.left.property.type === 'Identifier') {
      const keyLabel = this.program.addString(node.left.property.name);
      if (node.operator !== '=') {
        const oldTemp = this.newTemp();
        this.emit(OP.OBJ_GET, oldTemp, objTemp, keyLabel);
        const valTemp = computeVal(oldTemp);
        this.emit(OP.OBJ_SET, objTemp, keyLabel, valTemp);
        return { temp: valTemp, type: TYPE_INT };
      }
      this.emit(OP.OBJ_SET, objTemp, keyLabel, rightTemp);
      return { temp: rightTemp, type: TYPE_INT };
    }

    const { temp: idxTemp } = this.visitExpression(node.left.property);
    if (node.operator !== '=') {
      const oldTemp = this.newTemp();
      this.emit(OP.ARRAY_GET, oldTemp, objTemp, idxTemp);
      const valTemp = computeVal(oldTemp);
      this.emit(OP.ARRAY_SET, objTemp, idxTemp, valTemp);
      return { temp: valTemp, type: TYPE_INT };
    }
    this.emit(OP.ARRAY_SET, objTemp, idxTemp, rightTemp);
    return { temp: rightTemp, type: TYPE_INT };
  }

  throw new Error(`Unsupported assignment: ${node.operator} to ${node.left.type}`);
}

function _emitArrayDestructuringDecl(srcVarName, pattern, isConst) {
  for (let i = 0; i < pattern.elements.length; i++) {
    const elem = pattern.elements[i];
    if (!elem) continue;

    if (elem.type === 'RestElement') {
      const restName = elem.argument.name;
      const name = (!this.inFunction && this.moduleId) ? this.qualifyName(restName) : restName;
      const srcTemp = this.newTemp();
      this.emit(OP.LOAD_VAR, srcTemp, srcVarName);
      const startTemp = this.newTemp();
      this.emit(OP.LOAD_INT, startTemp, i);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, srcTemp);
      const restArr = this.newTemp();
      this.emit(OP.ARRAY_SLICE, restArr, srcTemp, startTemp, lenTemp);
      this.analyzer.currentScope.declare(restName, { type: TYPE_ARRAY, isConst, qualifiedName: name });
      if (!this.inFunction) this.program.globals.add(name);
      this.emit(OP.STORE_VAR, name, restArr);
      break;
    }

    if (elem.type === 'AssignmentPattern') {
      const localName = elem.left.name;
      const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
      this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
      if (!this.inFunction) this.program.globals.add(name);
      // Check bounds
      const srcTemp0 = this.newTemp();
      this.emit(OP.LOAD_VAR, srcTemp0, srcVarName);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, srcTemp0);
      const idxTemp0 = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp0, i);
      const inBounds = this.newTemp();
      this.emit(OP.CMP_GT, inBounds, lenTemp, idxTemp0);
      const useElemLabel = this.newLabel('nadef_elem');
      const endDefLabel = this.newLabel('nadef_end');
      this.emit(OP.JUMP_IF_TRUE, inBounds, useElemLabel);
      const { temp: defVal } = this.visitExpression(elem.right);
      this.emit(OP.STORE_VAR, name, defVal);
      this.emit(OP.JUMP, endDefLabel);
      this.emit(OP.LABEL, useElemLabel);
      const valTemp0 = this.newTemp();
      this.emit(OP.ARRAY_GET, valTemp0, srcTemp0, idxTemp0);
      this.emit(OP.STORE_VAR, name, valTemp0);
      this.emit(OP.LABEL, endDefLabel);
      continue;
    }

    const srcTemp = this.newTemp();
    this.emit(OP.LOAD_VAR, srcTemp, srcVarName);
    const idxTemp = this.newTemp();
    this.emit(OP.LOAD_INT, idxTemp, i);
    const valTemp = this.newTemp();
    this.emit(OP.ARRAY_GET, valTemp, srcTemp, idxTemp);

    if (elem.type === 'ArrayPattern') {
      const tempName = `_nested_arr_${this.labelCounter++}`;
      this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
      this.emit(OP.STORE_VAR, tempName, valTemp);
      this._emitArrayDestructuringDecl(tempName, elem, isConst);
      continue;
    }

    if (elem.type === 'ObjectPattern') {
      const tempName = `_nested_obj_${this.labelCounter++}`;
      this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
      this.emit(OP.STORE_VAR, tempName, valTemp);
      this._emitObjectDestructuringDecl(tempName, elem, isConst);
      continue;
    }

    const localName = elem.name;
    const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
    this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
    if (!this.inFunction) this.program.globals.add(name);
    this.emit(OP.STORE_VAR, name, valTemp);
  }
}

function _emitObjectDestructuringDecl(srcVarName, pattern, isConst) {
  for (const prop of pattern.properties) {
    if (prop.type === 'RestElement') continue;

    const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
    const keyLabel = this.program.addString(keyName);
    const srcTemp = this.newTemp();
    this.emit(OP.LOAD_VAR, srcTemp, srcVarName);
    const valTemp = this.newTemp();
    this.emit(OP.OBJ_GET, valTemp, srcTemp, keyLabel);

    const target = prop.value || prop.key;

    if (target.type === 'AssignmentPattern') {
      const localName = target.left.name;
      const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
      this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
      if (!this.inFunction) this.program.globals.add(name);
      // Check key existence
      const hasKey = this.newTemp();
      this.emit(OP.OBJ_HAS_OWN, hasKey, srcTemp, keyLabel);
      const useValLabel = this.newLabel('nodef_val');
      const endDefLabel = this.newLabel('nodef_end');
      this.emit(OP.JUMP_IF_TRUE, hasKey, useValLabel);
      const { temp: defVal } = this.visitExpression(target.right);
      this.emit(OP.STORE_VAR, name, defVal);
      this.emit(OP.JUMP, endDefLabel);
      this.emit(OP.LABEL, useValLabel);
      this.emit(OP.STORE_VAR, name, valTemp);
      this.emit(OP.LABEL, endDefLabel);
      continue;
    }

    if (target.type === 'ObjectPattern') {
      const tempName = `_nested_obj_${this.labelCounter++}`;
      this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
      this.emit(OP.STORE_VAR, tempName, valTemp);
      this._emitObjectDestructuringDecl(tempName, target, isConst);
      continue;
    }

    if (target.type === 'ArrayPattern') {
      const tempName = `_nested_arr_${this.labelCounter++}`;
      this.analyzer.currentScope.declare(tempName, { type: TYPE_INT, isConst: false });
      this.emit(OP.STORE_VAR, tempName, valTemp);
      this._emitArrayDestructuringDecl(tempName, target, isConst);
      continue;
    }

    const localName = target.type === 'Identifier' ? target.name : keyName;
    const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
    this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst, qualifiedName: name });
    if (!this.inFunction) this.program.globals.add(name);
    this.emit(OP.STORE_VAR, name, valTemp);
  }
}

module.exports = {
  visitVariableDeclaration,
  visitExpressionStatement,
  visitAssignment,
  visitConsoleLog,
  visitConsoleError,
  visitProcessExit,
  _emitArrayDestructuringDecl,
  _emitObjectDestructuringDecl,
};
