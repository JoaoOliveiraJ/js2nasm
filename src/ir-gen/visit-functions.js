'use strict';

const { IRFunction, OP } = require('../ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY, TYPE_FUNCTION } = require('../types');

function visitFunctionDeclaration(node) {
  const rawName = node.id.name;
  const qualifiedName = (!this.inFunction && this.moduleId) ? this.qualifyName(rawName) : rawName;

  // Separate rest param from regular params
  let restParam = null;
  const regularParams = [];
  for (const p of node.params) {
    if (p.type === 'RestElement') {
      restParam = p.argument.name;
    } else {
      regularParams.push(p);
    }
  }

  const params = regularParams.map((p, i) => {
    if (p.type === 'AssignmentPattern') return p.left.name;
    if (p.type === 'ObjectPattern' || p.type === 'ArrayPattern') return `_dparam_${i}`;
    return p.name;
  });
  // Include rest param name in the formal params list for stack allocation
  const allParamNames = restParam ? [...params, restParam] : params;

  // Register in analyzer scope with qualified name
  this.analyzer.currentScope.declare(rawName, { type: TYPE_FUNCTION, isConst: true, qualifiedName });

  const func = new IRFunction(qualifiedName, allParamNames);
  // Store metadata about rest param
  func.restParamIndex = restParam ? regularParams.length : -1;
  this.program.functions.push(func);

  // Save state
  const prevInstructions = this.currentInstructions;
  const prevScope = this.analyzer.currentScope;
  const prevInFunction = this.inFunction;
  const prevReturnType = this._currentFunctionReturnType;
  const prevReturnParam = this._currentFunctionReturnParam;
  const prevFunctionParams = this._currentFunctionParams;

  this.currentInstructions = func.body;
  this.inFunction = true;
  this._currentFunctionReturnType = TYPE_INT;
  this._currentFunctionReturnParam = -1;
  this._currentFunctionParams = params;
  this.analyzer.enterScope();

  // Declare regular params (with default values and destructuring support)
  for (let i = 0; i < regularParams.length; i++) {
    const p = regularParams[i];
    if (p.type === 'ObjectPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitObjectDestructuring(paramName, p);
    } else if (p.type === 'ArrayPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitArrayDestructuring(paramName, p);
    } else {
      const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
      this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, pName, i);
      if (p.type === 'AssignmentPattern') {
        const endDefLabel = this.newLabel('enddefparam');
        this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
        const { temp: defVal } = this.visitExpression(p.right);
        this.emit(OP.STORE_VAR, pName, defVal);
        this.emit(OP.LABEL, endDefLabel);
      }
    }
  }

  // Rest param: declare as empty array (populated at call site is not yet supported)
  if (restParam) {
    this.analyzer.currentScope.declare(restParam, { type: TYPE_ARRAY, isConst: false });
    // Create an empty array for rest param
    const emptyArr = this.newTemp();
    this.emit(OP.ARRAY_NEW, emptyArr, []);
    this.emit(OP.STORE_VAR, restParam, emptyArr);
  }

  // Visit body
  for (const stmt of node.body.body) {
    this.visitStatement(stmt);
  }

  // Collect locals (all variables declared in function scope)
  func.locals = [...this.analyzer.currentScope.variables.keys()];

  // Store return type info for this function
  if (!this._functionReturnTypes) this._functionReturnTypes = {};
  this._functionReturnTypes[qualifiedName] = this._currentFunctionReturnType;
  if (!this._functionReturnParams) this._functionReturnParams = {};
  if (this._currentFunctionReturnParam >= 0) {
    this._functionReturnParams[qualifiedName] = this._currentFunctionReturnParam;
  }

  // Restore state
  this.analyzer.exitScope();
  this.currentInstructions = prevInstructions;
  this.inFunction = prevInFunction;
  this._currentFunctionReturnType = prevReturnType;
  this._currentFunctionReturnParam = prevReturnParam;
  this._currentFunctionParams = prevFunctionParams;
}

function visitArrowFunction(node) {
  // Treat arrow functions like anonymous function declarations
  const rawName = `_arrow_${this.labelCounter++}`;
  const name = this.moduleId ? this.qualifyName(rawName) : rawName;

  let restParam = null;
  const regularParams = [];
  for (const p of node.params) {
    if (p.type === 'RestElement') {
      restParam = p.argument.name;
    } else {
      regularParams.push(p);
    }
  }

  const params = regularParams.map((p, i) => {
    if (p.type === 'AssignmentPattern') return p.left.name;
    if (p.type === 'ObjectPattern' || p.type === 'ArrayPattern') return `_dparam_${i}`;
    return p.name;
  });
  const allParamNames = restParam ? [...params, restParam] : params;

  const func = new IRFunction(name, allParamNames);
  func.restParamIndex = restParam ? regularParams.length : -1;
  this.program.functions.push(func);

  const prevInstructions = this.currentInstructions;
  const prevInFunction = this.inFunction;
  const prevReturnType = this._currentFunctionReturnType;
  const prevReturnParam = this._currentFunctionReturnParam;
  const prevFunctionParams = this._currentFunctionParams;

  this.currentInstructions = func.body;
  this.inFunction = true;
  this._currentFunctionReturnType = TYPE_INT;
  this._currentFunctionReturnParam = -1;
  this._currentFunctionParams = params;
  this.analyzer.enterScope();

  // Declare regular params (with default values and destructuring)
  for (let i = 0; i < regularParams.length; i++) {
    const p = regularParams[i];
    if (p.type === 'ObjectPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitObjectDestructuring(paramName, p);
    } else if (p.type === 'ArrayPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitArrayDestructuring(paramName, p);
    } else {
      const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
      this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, pName, i);
      if (p.type === 'AssignmentPattern') {
        const endDefLabel = this.newLabel('enddefparam');
        this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
        const { temp: defVal } = this.visitExpression(p.right);
        this.emit(OP.STORE_VAR, pName, defVal);
        this.emit(OP.LABEL, endDefLabel);
      }
    }
  }

  if (restParam) {
    this.analyzer.currentScope.declare(restParam, { type: TYPE_ARRAY, isConst: false });
    const emptyArr = this.newTemp();
    this.emit(OP.ARRAY_NEW, emptyArr, []);
    this.emit(OP.STORE_VAR, restParam, emptyArr);
  }

  // Body
  if (node.body.type === 'BlockStatement') {
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
  } else {
    // Concise body — expression auto-returned
    const { temp, type } = this.visitExpression(node.body);
    this._currentFunctionReturnType = type;
    // Track if returning a param
    if (node.body.type === 'Identifier') {
      const paramIdx = params.indexOf(node.body.name);
      if (paramIdx !== -1) this._currentFunctionReturnParam = paramIdx;
    }
    this.emit(OP.RETURN, temp);
  }

  func.locals = [...this.analyzer.currentScope.variables.keys()];

  // Store return type info for this function
  if (!this._functionReturnTypes) this._functionReturnTypes = {};
  this._functionReturnTypes[name] = this._currentFunctionReturnType;
  if (!this._functionReturnParams) this._functionReturnParams = {};
  if (this._currentFunctionReturnParam >= 0) {
    this._functionReturnParams[name] = this._currentFunctionReturnParam;
  }

  this.analyzer.exitScope();
  this.currentInstructions = prevInstructions;
  this.inFunction = prevInFunction;
  this._currentFunctionReturnType = prevReturnType;
  this._currentFunctionReturnParam = prevReturnParam;
  this._currentFunctionParams = prevFunctionParams;

  // Return the function name as a reference
  const t = this.newTemp();
  const label = this.program.addString(name);
  this.emit(OP.LOAD_STRING, t, label);
  return { temp: t, type: TYPE_FUNCTION, funcName: name };
}

function visitFunctionExpression(node) {
  // Treat function expressions like anonymous/named function declarations
  const rawName = node.id ? node.id.name : `_func_expr_${this.labelCounter++}`;
  const name = this.moduleId ? this.qualifyName(rawName) : rawName;

  let restParam = null;
  const regularParams = [];
  for (const p of node.params) {
    if (p.type === 'RestElement') {
      restParam = p.argument.name;
    } else {
      regularParams.push(p);
    }
  }

  const params = regularParams.map((p, i) => {
    if (p.type === 'AssignmentPattern') return p.left.name;
    if (p.type === 'ObjectPattern' || p.type === 'ArrayPattern') return `_dparam_${i}`;
    return p.name;
  });
  const allParamNames = restParam ? [...params, restParam] : params;

  const func = new IRFunction(name, allParamNames);
  func.restParamIndex = restParam ? regularParams.length : -1;
  this.program.functions.push(func);

  const prevInstructions = this.currentInstructions;
  const prevInFunction = this.inFunction;
  const prevReturnType = this._currentFunctionReturnType;
  const prevReturnParam = this._currentFunctionReturnParam;
  const prevFunctionParams = this._currentFunctionParams;

  this.currentInstructions = func.body;
  this.inFunction = true;
  this._currentFunctionReturnType = TYPE_INT;
  this._currentFunctionReturnParam = -1;
  this._currentFunctionParams = params;
  this.analyzer.enterScope();

  // If named, declare the name inside the function's own scope (for recursion)
  if (node.id) {
    this.analyzer.currentScope.declare(rawName, { type: TYPE_FUNCTION, isConst: true });
  }

  // Declare regular params (with default values and destructuring)
  for (let i = 0; i < regularParams.length; i++) {
    const p = regularParams[i];
    if (p.type === 'ObjectPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitObjectDestructuring(paramName, p);
    } else if (p.type === 'ArrayPattern') {
      const paramName = `_dparam_${i}`;
      this.analyzer.currentScope.declare(paramName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, paramName, i);
      this._emitArrayDestructuring(paramName, p);
    } else {
      const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
      this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, pName, i);
      if (p.type === 'AssignmentPattern') {
        const endDefLabel = this.newLabel('enddefparam');
        this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
        const { temp: defVal } = this.visitExpression(p.right);
        this.emit(OP.STORE_VAR, pName, defVal);
        this.emit(OP.LABEL, endDefLabel);
      }
    }
  }

  if (restParam) {
    this.analyzer.currentScope.declare(restParam, { type: TYPE_ARRAY, isConst: false });
    const emptyArr = this.newTemp();
    this.emit(OP.ARRAY_NEW, emptyArr, []);
    this.emit(OP.STORE_VAR, restParam, emptyArr);
  }

  // Body (always BlockStatement for function expressions)
  for (const stmt of node.body.body) {
    this.visitStatement(stmt);
  }

  func.locals = [...this.analyzer.currentScope.variables.keys()];

  if (!this._functionReturnTypes) this._functionReturnTypes = {};
  this._functionReturnTypes[name] = this._currentFunctionReturnType;
  if (!this._functionReturnParams) this._functionReturnParams = {};
  if (this._currentFunctionReturnParam >= 0) {
    this._functionReturnParams[name] = this._currentFunctionReturnParam;
  }

  this.analyzer.exitScope();
  this.currentInstructions = prevInstructions;
  this.inFunction = prevInFunction;
  this._currentFunctionReturnType = prevReturnType;
  this._currentFunctionReturnParam = prevReturnParam;
  this._currentFunctionParams = prevFunctionParams;

  // Return the function name as a reference
  const t = this.newTemp();
  const label = this.program.addString(name);
  this.emit(OP.LOAD_STRING, t, label);
  return { temp: t, type: TYPE_FUNCTION, funcName: name };
}

function visitCallExpression(node) {
  // console.log/error handled in visitExpressionStatement when standalone
  // But can also appear as expression (e.g., let x = console.log(...))
  if (node.callee.type === 'MemberExpression') {
    const obj = node.callee.object;
    const prop = node.callee.property;
    const propName = prop.name || prop.value;

    // console.log / console.error as expression
    if (obj.type === 'Identifier' && obj.name === 'console' && propName === 'log') {
      this.visitConsoleLog(node);
      const t = this.newTemp();
      this.emit(OP.LOAD_UNDEFINED, t);
      return { temp: t, type: TYPE_INT };
    }
    if (obj.type === 'Identifier' && obj.name === 'console' && propName === 'error') {
      this.visitConsoleError(node);
      const t = this.newTemp();
      this.emit(OP.LOAD_UNDEFINED, t);
      return { temp: t, type: TYPE_INT };
    }

    // process.exit
    if (obj.type === 'Identifier' && obj.name === 'process' && propName === 'exit') {
      this.visitProcessExit(node);
      const t = this.newTemp();
      this.emit(OP.LOAD_INT, t, 0);
      return { temp: t, type: TYPE_INT };
    }

    // Array methods
    if (propName === 'push') {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: valTemp, type: valType } = this.visitExpression(node.arguments[0]);
      this.emit(OP.ARRAY_PUSH, arrTemp, valTemp, valType);
      const t = this.newTemp();
      this.emit(OP.LOAD_INT, t, 0);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'pop') {
      const { temp: arrTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.ARRAY_POP, t, arrTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'shift') {
      const { temp: arrTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.ARRAY_SHIFT, t, arrTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'unshift') {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: valTemp, type: valType } = this.visitExpression(node.arguments[0]);
      this.emit(OP.ARRAY_UNSHIFT, arrTemp, valTemp, valType);
      const t = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, t, arrTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'indexOf' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: valTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.ARRAY_INDEX_OF, t, arrTemp, valTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'includes' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: valTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.ARRAY_INCLUDES, t, arrTemp, valTemp);
      return { temp: t, type: TYPE_BOOL };
    }
    if (propName === 'join') {
      const { temp: arrTemp } = this.visitExpression(obj);
      let sepTemp;
      if (node.arguments.length > 0) {
        sepTemp = this.visitExpression(node.arguments[0]).temp;
      } else {
        sepTemp = this.newTemp();
        const label = this.program.addString(',');
        this.emit(OP.LOAD_STRING, sepTemp, label);
      }
      const t = this.newTemp();
      this.emit(OP.ARRAY_JOIN, t, arrTemp, sepTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'slice' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: startTemp } = node.arguments.length > 0
        ? this.visitExpression(node.arguments[0])
        : (() => { const t = this.newTemp(); this.emit(OP.LOAD_INT, t, 0); return { temp: t }; })();
      let endTemp;
      if (node.arguments.length > 1) {
        endTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        endTemp = this.newTemp();
        this.emit(OP.ARRAY_LENGTH, endTemp, arrTemp);
      }
      const t = this.newTemp();
      this.emit(OP.ARRAY_SLICE, t, arrTemp, startTemp, endTemp);
      return { temp: t, type: TYPE_ARRAY };
    }
    if (propName === 'reverse') {
      const { temp: arrTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.ARRAY_REVERSE, t, arrTemp);
      return { temp: t, type: TYPE_ARRAY };
    }
    if (propName === 'concat' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: arr2Temp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.ARRAY_CONCAT, t, arrTemp, arr2Temp);
      return { temp: t, type: TYPE_ARRAY };
    }
    if (propName === 'splice' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: startTemp } = this.visitExpression(node.arguments[0]);
      let delCountTemp;
      if (node.arguments.length > 1) {
        delCountTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        // Default: delete everything from start
        delCountTemp = this.newTemp();
        this.emit(OP.ARRAY_LENGTH, delCountTemp, arrTemp);
      }
      // Collect items to insert
      const items = [];
      for (let i = 2; i < node.arguments.length; i++) {
        const { temp, type } = this.visitExpression(node.arguments[i]);
        items.push({ temp, type });
      }
      const t = this.newTemp();
      this.emit(OP.ARRAY_SPLICE, t, arrTemp, startTemp, delCountTemp, items);
      return { temp: t, type: TYPE_ARRAY };
    }
    if (propName === 'fill' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const { temp: valTemp } = this.visitExpression(node.arguments[0]);
      let startTemp, endTemp;
      if (node.arguments.length > 1) {
        startTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        startTemp = this.newTemp();
        this.emit(OP.LOAD_INT, startTemp, 0);
      }
      if (node.arguments.length > 2) {
        endTemp = this.visitExpression(node.arguments[2]).temp;
      } else {
        endTemp = this.newTemp();
        this.emit(OP.ARRAY_LENGTH, endTemp, arrTemp);
      }
      const t = this.newTemp();
      this.emit(OP.ARRAY_FILL, t, arrTemp, valTemp, startTemp, endTemp);
      return { temp: t, type: TYPE_ARRAY };
    }

    // Array higher-order methods (desugared into loops)
    if (propName === 'forEach' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_forEach_i_${this.labelCounter}`;
      const loopLabel = this.newLabel('forEach');
      const endLabel = this.newLabel('endForEach');

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const t = this.newTemp();
      this.emit(OP.LOAD_UNDEFINED, t);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'map' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_map_i_${this.labelCounter}`;
      const loopLabel = this.newLabel('map');
      const endLabel = this.newLabel('endMap');

      // Create result array
      const resultArr = this.newTemp();
      this.emit(OP.ARRAY_NEW, resultArr, []);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.ARRAY_PUSH, resultArr, callRes, TYPE_INT);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      return { temp: resultArr, type: TYPE_ARRAY };
    }
    if (propName === 'filter' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_filter_i_${this.labelCounter}`;
      const loopLabel = this.newLabel('filter');
      const skipLabel = this.newLabel('filterSkip');
      const endLabel = this.newLabel('endFilter');

      const resultArr = this.newTemp();
      this.emit(OP.ARRAY_NEW, resultArr, []);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.JUMP_IF_FALSE, callRes, skipLabel);
      this.emit(OP.ARRAY_PUSH, resultArr, elemT, TYPE_INT);
      this.emit(OP.LABEL, skipLabel);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      return { temp: resultArr, type: TYPE_ARRAY };
    }
    if (propName === 'reduce' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const accName = `_reduce_acc_${this.labelCounter}`;
      const idxName = `_reduce_i_${this.labelCounter}`;
      const loopLabel = this.newLabel('reduce');
      const endLabel = this.newLabel('endReduce');

      // Initial value
      if (node.arguments.length > 1) {
        const { temp: initTemp } = this.visitExpression(node.arguments[1]);
        this.emit(OP.STORE_VAR, accName, initTemp);
      } else {
        const zeroTemp = this.newTemp();
        this.emit(OP.LOAD_INT, zeroTemp, 0);
        this.emit(OP.STORE_VAR, accName, zeroTemp);
      }

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const accLoad = this.newTemp();
      this.emit(OP.LOAD_VAR, accLoad, accName);
      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: accLoad, type: TYPE_INT },
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);
      this.emit(OP.STORE_VAR, accName, callRes);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, accName);
      return { temp: result, type: TYPE_INT };
    }
    if (propName === 'find' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_find_i_${this.labelCounter}`;
      const resultName = `_find_res_${this.labelCounter}`;
      const loopLabel = this.newLabel('find');
      const foundLabel = this.newLabel('findFound');
      const endLabel = this.newLabel('endFind');

      // Default result: undefined (0)
      const undefTemp = this.newTemp();
      this.emit(OP.LOAD_UNDEFINED, undefTemp);
      this.emit(OP.STORE_VAR, resultName, undefTemp);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.JUMP_IF_FALSE, callRes, foundLabel);
      this.emit(OP.STORE_VAR, resultName, elemT);
      this.emit(OP.JUMP, endLabel);
      this.emit(OP.LABEL, foundLabel);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, resultName);
      return { temp: result, type: TYPE_INT };
    }
    if (propName === 'some' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_some_i_${this.labelCounter}`;
      const resultName = `_some_res_${this.labelCounter}`;
      const loopLabel = this.newLabel('some');
      const skipLabel = this.newLabel('someSkip');
      const endLabel = this.newLabel('endSome');

      const falseTemp = this.newTemp();
      this.emit(OP.LOAD_BOOL, falseTemp, 0);
      this.emit(OP.STORE_VAR, resultName, falseTemp);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.JUMP_IF_FALSE, callRes, skipLabel);
      const trueTemp = this.newTemp();
      this.emit(OP.LOAD_BOOL, trueTemp, 1);
      this.emit(OP.STORE_VAR, resultName, trueTemp);
      this.emit(OP.JUMP, endLabel);
      this.emit(OP.LABEL, skipLabel);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, resultName);
      return { temp: result, type: TYPE_BOOL };
    }
    if (propName === 'every' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_every_i_${this.labelCounter}`;
      const resultName = `_every_res_${this.labelCounter}`;
      const loopLabel = this.newLabel('every');
      const skipLabel = this.newLabel('everySkip');
      const endLabel = this.newLabel('endEvery');

      const trueTemp = this.newTemp();
      this.emit(OP.LOAD_BOOL, trueTemp, 1);
      this.emit(OP.STORE_VAR, resultName, trueTemp);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.JUMP_IF_TRUE, callRes, skipLabel);
      const falseTemp = this.newTemp();
      this.emit(OP.LOAD_BOOL, falseTemp, 0);
      this.emit(OP.STORE_VAR, resultName, falseTemp);
      this.emit(OP.JUMP, endLabel);
      this.emit(OP.LABEL, skipLabel);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, resultName);
      return { temp: result, type: TYPE_BOOL };
    }
    if (propName === 'findIndex' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);
      const cbName = this._resolveCallbackName(node.arguments[0]);
      const idxName = `_findIdx_i_${this.labelCounter}`;
      const resultName = `_findIdx_res_${this.labelCounter}`;
      const loopLabel = this.newLabel('findIdx');
      const skipLabel = this.newLabel('findIdxSkip');
      const endLabel = this.newLabel('endFindIdx');

      const negOneTemp = this.newTemp();
      this.emit(OP.LOAD_INT, negOneTemp, -1);
      this.emit(OP.STORE_VAR, resultName, negOneTemp);

      const idxTemp = this.newTemp();
      this.emit(OP.LOAD_INT, idxTemp, 0);
      this.emit(OP.STORE_VAR, idxName, idxTemp);

      this.emit(OP.LABEL, loopLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, idxName);
      const cmpT = this.newTemp();
      this.emit(OP.CMP_LT, cmpT, il, lenTemp);
      this.emit(OP.JUMP_IF_FALSE, cmpT, endLabel);

      const elemT = this.newTemp();
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, idxName);
      this.emit(OP.ARRAY_GET, elemT, arrTemp, il2);

      const callRes = this.newTemp();
      const il3 = this.newTemp();
      this.emit(OP.LOAD_VAR, il3, idxName);
      this.emit(OP.CALL, callRes, cbName, [
        { temp: elemT, type: TYPE_INT },
        { temp: il3, type: TYPE_INT },
        { temp: arrTemp, type: TYPE_ARRAY }
      ]);

      this.emit(OP.JUMP_IF_FALSE, callRes, skipLabel);
      const il4 = this.newTemp();
      this.emit(OP.LOAD_VAR, il4, idxName);
      this.emit(OP.STORE_VAR, resultName, il4);
      this.emit(OP.JUMP, endLabel);
      this.emit(OP.LABEL, skipLabel);

      const incT = this.newTemp();
      this.emit(OP.PRE_INC, incT, idxName);
      this.emit(OP.JUMP, loopLabel);
      this.emit(OP.LABEL, endLabel);

      const result = this.newTemp();
      this.emit(OP.LOAD_VAR, result, resultName);
      return { temp: result, type: TYPE_INT };
    }
    if (propName === 'sort' && this._isArrayLike(obj)) {
      const { temp: arrTemp } = this.visitExpression(obj);

      // Bubble sort with optional comparator
      const iName = `_sort_i_${this.labelCounter}`;
      const jName = `_sort_j_${this.labelCounter}`;
      const outerLabel = this.newLabel('sortOuter');
      const innerLabel = this.newLabel('sortInner');
      const skipLabel = this.newLabel('sortSkip');
      const outerEndLabel = this.newLabel('sortOuterEnd');
      const innerEndLabel = this.newLabel('sortInnerEnd');

      const hasComparator = node.arguments.length > 0;
      let cbName;
      if (hasComparator) {
        cbName = this._resolveCallbackName(node.arguments[0]);
      }

      // outer: for (i = 0; i < len - 1; i++)
      const iTemp = this.newTemp();
      this.emit(OP.LOAD_INT, iTemp, 0);
      this.emit(OP.STORE_VAR, iName, iTemp);

      this.emit(OP.LABEL, outerLabel);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, arrTemp);
      const lenM1 = this.newTemp();
      const oneTemp = this.newTemp();
      this.emit(OP.LOAD_INT, oneTemp, 1);
      this.emit(OP.SUB, lenM1, lenTemp, oneTemp);
      const il = this.newTemp();
      this.emit(OP.LOAD_VAR, il, iName);
      const cmpOuter = this.newTemp();
      this.emit(OP.CMP_LT, cmpOuter, il, lenM1);
      this.emit(OP.JUMP_IF_FALSE, cmpOuter, outerEndLabel);

      // inner: for (j = 0; j < len - i - 1; j++)
      const jTemp = this.newTemp();
      this.emit(OP.LOAD_INT, jTemp, 0);
      this.emit(OP.STORE_VAR, jName, jTemp);

      this.emit(OP.LABEL, innerLabel);
      const len2 = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, len2, arrTemp);
      const il2 = this.newTemp();
      this.emit(OP.LOAD_VAR, il2, iName);
      const one2 = this.newTemp();
      this.emit(OP.LOAD_INT, one2, 1);
      const sub1 = this.newTemp();
      this.emit(OP.SUB, sub1, len2, il2);
      const bound = this.newTemp();
      this.emit(OP.SUB, bound, sub1, one2);
      const jl = this.newTemp();
      this.emit(OP.LOAD_VAR, jl, jName);
      const cmpInner = this.newTemp();
      this.emit(OP.CMP_LT, cmpInner, jl, bound);
      this.emit(OP.JUMP_IF_FALSE, cmpInner, innerEndLabel);

      // Compare arr[j] and arr[j+1]
      const jl2 = this.newTemp();
      this.emit(OP.LOAD_VAR, jl2, jName);
      const aTemp = this.newTemp();
      this.emit(OP.ARRAY_GET, aTemp, arrTemp, jl2);
      const jp1 = this.newTemp();
      const jl3 = this.newTemp();
      this.emit(OP.LOAD_VAR, jl3, jName);
      const one3 = this.newTemp();
      this.emit(OP.LOAD_INT, one3, 1);
      this.emit(OP.ADD, jp1, jl3, one3);
      const bTemp = this.newTemp();
      this.emit(OP.ARRAY_GET, bTemp, arrTemp, jp1);

      if (hasComparator) {
        // Call comparator(a, b) — swap if result > 0
        const cmpRes = this.newTemp();
        this.emit(OP.CALL, cmpRes, cbName, [
          { temp: aTemp, type: TYPE_INT },
          { temp: bTemp, type: TYPE_INT }
        ]);
        const zeroT = this.newTemp();
        this.emit(OP.LOAD_INT, zeroT, 0);
        const shouldSwap = this.newTemp();
        this.emit(OP.CMP_GT, shouldSwap, cmpRes, zeroT);
        this.emit(OP.JUMP_IF_FALSE, shouldSwap, skipLabel);
      } else {
        // Default: ascending order, swap if a > b
        const shouldSwap = this.newTemp();
        this.emit(OP.CMP_GT, shouldSwap, aTemp, bTemp);
        this.emit(OP.JUMP_IF_FALSE, shouldSwap, skipLabel);
      }

      // Swap arr[j] and arr[j+1]
      const jl4 = this.newTemp();
      this.emit(OP.LOAD_VAR, jl4, jName);
      this.emit(OP.ARRAY_SET, arrTemp, jl4, bTemp);
      const jl5 = this.newTemp();
      this.emit(OP.LOAD_VAR, jl5, jName);
      const one4 = this.newTemp();
      this.emit(OP.LOAD_INT, one4, 1);
      const jp1_2 = this.newTemp();
      this.emit(OP.ADD, jp1_2, jl5, one4);
      this.emit(OP.ARRAY_SET, arrTemp, jp1_2, aTemp);

      this.emit(OP.LABEL, skipLabel);

      // j++
      const incJ = this.newTemp();
      this.emit(OP.PRE_INC, incJ, jName);
      this.emit(OP.JUMP, innerLabel);
      this.emit(OP.LABEL, innerEndLabel);

      // i++
      const incI = this.newTemp();
      this.emit(OP.PRE_INC, incI, iName);
      this.emit(OP.JUMP, outerLabel);
      this.emit(OP.LABEL, outerEndLabel);

      return { temp: arrTemp, type: TYPE_ARRAY };
    }

    // Math functions
    if (obj.type === 'Identifier' && obj.name === 'Math') {
      return this.visitMathCall(propName, node.arguments);
    }

    // Object static methods
    if (obj.type === 'Identifier' && obj.name === 'Object') {
      if (propName === 'keys') {
        const { temp: objTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.OBJ_KEYS, t, objTemp);
        return { temp: t, type: TYPE_ARRAY };
      }
      if (propName === 'values') {
        const { temp: objTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.OBJ_VALUES, t, objTemp);
        return { temp: t, type: TYPE_ARRAY };
      }
      if (propName === 'entries') {
        const { temp: objTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.OBJ_ENTRIES, t, objTemp);
        return { temp: t, type: TYPE_ARRAY };
      }
      if (propName === 'assign') {
        // Object.assign(target, ...sources) — copy properties from sources to target
        const { temp: targetTemp } = this.visitExpression(node.arguments[0]);
        for (let i = 1; i < node.arguments.length; i++) {
          const { temp: srcTemp } = this.visitExpression(node.arguments[i]);
          this.emit(OP.OBJ_SPREAD, targetTemp, srcTemp);
        }
        return { temp: targetTemp, type: TYPE_INT };
      }
    }

    // Array.from() — creates a new array from an iterable (array or string)
    if (obj.type === 'Identifier' && obj.name === 'Array' && propName === 'from') {
      const { temp: srcTemp, type: srcType } = this.visitExpression(node.arguments[0]);
      if (srcType === TYPE_STRING) {
        // String → array of single-char strings (use split with empty string)
        const sepTemp = this.newTemp();
        const label = this.program.addString('');
        this.emit(OP.LOAD_STRING, sepTemp, label);
        const t = this.newTemp();
        this.emit(OP.STR_SPLIT, t, srcTemp, sepTemp);
        return { temp: t, type: TYPE_ARRAY };
      }
      // Array → shallow copy via slice(0, length)
      const startTemp = this.newTemp();
      this.emit(OP.LOAD_INT, startTemp, 0);
      const lenTemp = this.newTemp();
      this.emit(OP.ARRAY_LENGTH, lenTemp, srcTemp);
      const t = this.newTemp();
      this.emit(OP.ARRAY_SLICE, t, srcTemp, startTemp, lenTemp);
      return { temp: t, type: TYPE_ARRAY };
    }

    // Array.isArray()
    if (obj.type === 'Identifier' && obj.name === 'Array' && propName === 'isArray') {
      const { temp: valTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.ARRAY_IS_ARRAY, t, valTemp);
      return { temp: t, type: TYPE_BOOL };
    }

    // String static methods
    if (obj.type === 'Identifier' && obj.name === 'String' && propName === 'fromCharCode') {
      const { temp: codeTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_FROM_CHAR_CODE, t, codeTemp);
      return { temp: t, type: TYPE_STRING };
    }

    // Number static methods
    if (obj.type === 'Identifier' && obj.name === 'Number') {
      if (propName === 'isInteger') {
        const { temp: valTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.NUM_IS_INTEGER, t, valTemp);
        return { temp: t, type: TYPE_BOOL };
      }
      if (propName === 'isFinite') {
        const { temp: valTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.NUM_IS_FINITE, t, valTemp);
        return { temp: t, type: TYPE_BOOL };
      }
      if (propName === 'parseInt') {
        const { temp: argTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.PARSE_INT, t, argTemp);
        return { temp: t, type: TYPE_INT };
      }
      if (propName === 'parseFloat') {
        const { temp: argTemp } = this.visitExpression(node.arguments[0]);
        const t = this.newTemp();
        this.emit(OP.PARSE_FLOAT, t, argTemp);
        return { temp: t, type: TYPE_FLOAT };
      }
    }

    // String methods
    if (propName === 'charAt') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: idxTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_CHAR_AT, t, strTemp, idxTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'indexOf' && !this._isArrayLike(obj)) {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: searchTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_INDEX_OF, t, strTemp, searchTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'toUpperCase') {
      const { temp: strTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.STR_TO_UPPER, t, strTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'toLowerCase') {
      const { temp: strTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.STR_TO_LOWER, t, strTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'includes' && !this._isArrayLike(obj)) {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: searchTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_INCLUDES, t, strTemp, searchTemp);
      return { temp: t, type: TYPE_BOOL };
    }
    if (propName === 'trim') {
      const { temp: strTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.STR_TRIM, t, strTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'slice' && !this._isArrayLike(obj)) {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: startTemp } = this.visitExpression(node.arguments[0]);
      let endTemp;
      if (node.arguments.length > 1) {
        endTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        endTemp = this.newTemp();
        this.emit(OP.STR_LENGTH, endTemp, strTemp);
      }
      const t = this.newTemp();
      this.emit(OP.STR_SLICE, t, strTemp, startTemp, endTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'substring') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: startTemp } = this.visitExpression(node.arguments[0]);
      let endTemp;
      if (node.arguments.length > 1) {
        endTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        endTemp = this.newTemp();
        this.emit(OP.STR_LENGTH, endTemp, strTemp);
      }
      const t = this.newTemp();
      this.emit(OP.STR_SUBSTRING, t, strTemp, startTemp, endTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'split') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: sepTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_SPLIT, t, strTemp, sepTemp);
      return { temp: t, type: TYPE_ARRAY };
    }
    if (propName === 'replace') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: searchTemp } = this.visitExpression(node.arguments[0]);
      const { temp: replTemp } = this.visitExpression(node.arguments[1]);
      const t = this.newTemp();
      this.emit(OP.STR_REPLACE, t, strTemp, searchTemp, replTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'repeat') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: countTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_REPEAT, t, strTemp, countTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'startsWith') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: prefixTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_STARTS_WITH, t, strTemp, prefixTemp);
      return { temp: t, type: TYPE_BOOL };
    }
    if (propName === 'endsWith') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: suffixTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_ENDS_WITH, t, strTemp, suffixTemp);
      return { temp: t, type: TYPE_BOOL };
    }
    if (propName === 'charCodeAt') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: idxTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.STR_CHAR_CODE_AT, t, strTemp, idxTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (propName === 'padStart') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: lenTemp } = this.visitExpression(node.arguments[0]);
      let padTemp;
      if (node.arguments.length > 1) {
        padTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        padTemp = this.newTemp();
        const label = this.program.addString(' ');
        this.emit(OP.LOAD_STRING, padTemp, label);
      }
      const t = this.newTemp();
      this.emit(OP.STR_PAD_START, t, strTemp, lenTemp, padTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'padEnd') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: lenTemp } = this.visitExpression(node.arguments[0]);
      let padTemp;
      if (node.arguments.length > 1) {
        padTemp = this.visitExpression(node.arguments[1]).temp;
      } else {
        padTemp = this.newTemp();
        const label = this.program.addString(' ');
        this.emit(OP.LOAD_STRING, padTemp, label);
      }
      const t = this.newTemp();
      this.emit(OP.STR_PAD_END, t, strTemp, lenTemp, padTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'trimStart' || propName === 'trimLeft') {
      const { temp: strTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.STR_TRIM_START, t, strTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'trimEnd' || propName === 'trimRight') {
      const { temp: strTemp } = this.visitExpression(obj);
      const t = this.newTemp();
      this.emit(OP.STR_TRIM_END, t, strTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'replaceAll') {
      const { temp: strTemp } = this.visitExpression(obj);
      const { temp: searchTemp } = this.visitExpression(node.arguments[0]);
      const { temp: replTemp } = this.visitExpression(node.arguments[1]);
      const t = this.newTemp();
      this.emit(OP.STR_REPLACE_ALL, t, strTemp, searchTemp, replTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'toFixed') {
      const { temp: valTemp } = this.visitExpression(obj);
      let digitsTemp;
      if (node.arguments.length > 0) {
        digitsTemp = this.visitExpression(node.arguments[0]).temp;
      } else {
        digitsTemp = this.newTemp();
        this.emit(OP.LOAD_INT, digitsTemp, 0);
      }
      const t = this.newTemp();
      this.emit(OP.NUM_TO_FIXED, t, valTemp, digitsTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'toString') {
      const { temp: valTemp, type: valType } = this.visitExpression(obj);
      if (valType === TYPE_STRING) return { temp: valTemp, type: TYPE_STRING };
      const t = this.newTemp();
      this.emit(OP.TO_STRING, t, valTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (propName === 'hasOwnProperty') {
      const { temp: objTemp } = this.visitExpression(obj);
      const { temp: keyTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.OBJ_HAS_OWN, t, objTemp, keyTemp);
      return { temp: t, type: TYPE_BOOL };
    }

    // Static class method calls: ClassName.method(args) → ClassName_method(args)
    if (obj.type === 'Identifier') {
      const objInfo = this.analyzer.currentScope.lookup(obj.name);
      if (objInfo && objInfo.type === TYPE_FUNCTION && objInfo.className === obj.name) {
        // This is the class itself, not an instance — static method call
        let qualClsName = obj.name;
        if (objInfo.qualifiedName) qualClsName = objInfo.qualifiedName;
        const fullMethodName = `${qualClsName}_${propName}`;
        const args = [];
        for (const arg of node.arguments) {
          const { temp, type } = this.visitExpression(arg);
          args.push({ temp, type });
        }
        const t = this.newTemp();
        this.emit(OP.CALL, t, fullMethodName, args);
        return { temp: t, type: TYPE_INT };
      }
    }

    // Instance method calls: obj.method(args) → ClassName_method(obj, args...)
    if (obj.type === 'Identifier') {
      const objInfo = this.analyzer.currentScope.lookup(obj.name);
      if (objInfo && objInfo.className) {
        const clsName = objInfo.className;
        // Resolve qualified class name
        let qualClsName = clsName;
        const clsInfo = this.analyzer.currentScope.lookup(clsName);
        if (clsInfo && clsInfo.qualifiedName) {
          qualClsName = clsInfo.qualifiedName;
        }
        // Walk inheritance chain to find the method
        const fullMethodName = this._resolveClassMethod(qualClsName, propName);
        const { temp: objTemp } = this.visitExpression(obj);
        const args = [{ temp: objTemp, type: TYPE_INT }]; // 'this' as first arg
        for (const arg of node.arguments) {
          const { temp, type } = this.visitExpression(arg);
          args.push({ temp, type });
        }
        const t = this.newTemp();
        this.emit(OP.CALL, t, fullMethodName, args);
        return { temp: t, type: TYPE_INT };
      }
    }

    // this.method() inside class methods
    if (obj.type === 'Identifier' && obj.name === 'this') {
      const thisInfo = this.analyzer.currentScope.lookup('this');
      if (thisInfo && thisInfo.className) {
        let qualClsName = thisInfo.className;
        const clsInfo = this.analyzer.currentScope.lookup(thisInfo.className);
        if (clsInfo && clsInfo.qualifiedName) {
          qualClsName = clsInfo.qualifiedName;
        }
        // Walk inheritance chain to find the method
        const fullMethodName = this._resolveClassMethod(qualClsName, propName);
        const { temp: objTemp } = this.visitExpression(obj);
        const args = [{ temp: objTemp, type: TYPE_INT }];
        for (const arg of node.arguments) {
          const { temp, type } = this.visitExpression(arg);
          args.push({ temp, type });
        }
        const t = this.newTemp();
        this.emit(OP.CALL, t, fullMethodName, args);
        return { temp: t, type: TYPE_INT };
      }
    }
  }

  // super() call in constructor — call parent constructor
  if (node.callee.type === 'Super') {
    if (this._currentSuperClass) {
      const args = [];
      for (const arg of node.arguments) {
        const { temp, type } = this.visitExpression(arg);
        args.push({ temp, type });
      }
      // Call parent constructor, get the parent object
      const parentObj = this.newTemp();
      this.emit(OP.CALL, parentObj, this._currentSuperClass, args);
      // Copy all properties from parent object to 'this'
      const thisTemp = this.newTemp();
      this.emit(OP.LOAD_VAR, thisTemp, 'this');
      this.emit(OP.OBJ_SPREAD, thisTemp, parentObj);
      return { temp: thisTemp, type: TYPE_INT };
    }
    throw new Error('super() called outside of a class constructor');
  }

  // super.method() call — call parent class method
  if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Super') {
    if (this._currentSuperClass) {
      const methodName = node.callee.property.name;
      const fullMethodName = `${this._currentSuperClass}_${methodName}`;
      const thisTemp = this.newTemp();
      this.emit(OP.LOAD_VAR, thisTemp, 'this');
      const args = [{ temp: thisTemp, type: TYPE_INT }]; // 'this' as first arg
      for (const arg of node.arguments) {
        const { temp, type } = this.visitExpression(arg);
        args.push({ temp, type });
      }
      const t = this.newTemp();
      this.emit(OP.CALL, t, fullMethodName, args);
      return { temp: t, type: TYPE_INT };
    }
    throw new Error('super.method() called outside of a class');
  }

  // Global builtins: parseInt, parseFloat, Number, String, isNaN
  if (node.callee.type === 'Identifier') {
    const name = node.callee.name;
    if (name === 'parseInt') {
      const { temp: argTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.PARSE_INT, t, argTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (name === 'parseFloat') {
      const { temp: argTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.PARSE_FLOAT, t, argTemp);
      return { temp: t, type: TYPE_FLOAT };
    }
    if (name === 'Number') {
      const { temp: argTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.PARSE_INT, t, argTemp);
      return { temp: t, type: TYPE_INT };
    }
    if (name === 'String') {
      const { temp: argTemp, type: argType } = this.visitExpression(node.arguments[0]);
      if (argType === TYPE_STRING) return { temp: argTemp, type: TYPE_STRING };
      const t = this.newTemp();
      this.emit(OP.TO_STRING, t, argTemp);
      return { temp: t, type: TYPE_STRING };
    }
    if (name === 'isNaN') {
      const { temp: argTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.IS_NAN, t, argTemp);
      return { temp: t, type: TYPE_BOOL };
    }
  }

  // IIFE or call on expression result: (function(x){...})(args), (() => x)(args)
  if (node.callee.type === 'FunctionExpression' || node.callee.type === 'ArrowFunctionExpression') {
    const exprResult = node.callee.type === 'FunctionExpression'
      ? this.visitFunctionExpression(node.callee)
      : this.visitArrowFunction(node.callee);
    const funcName = exprResult.funcName;
    const args = [];
    for (const arg of node.arguments) {
      const { temp, type } = this.visitExpression(arg);
      args.push({ temp, type });
    }
    const t = this.newTemp();
    this.emit(OP.CALL, t, funcName, args);
    return { temp: t, type: TYPE_INT };
  }

  // Regular function call
  let funcName = node.callee.name;

  // Resolve through importMap or qualified scope
  if (funcName && this.importMap.has(funcName)) {
    funcName = this.importMap.get(funcName);
  } else if (funcName) {
    const info = this.analyzer.currentScope.lookup(funcName);
    if (info && info.qualifiedName) {
      funcName = info.qualifiedName;
    }
  }

  // Check for spread arguments
  const hasSpread = node.arguments.some(a => a.type === 'SpreadElement');

  if (hasSpread) {
    // Collect normal args before the spread, and the spread array
    const normalArgs = [];
    let spreadArray = null;
    for (const arg of node.arguments) {
      if (arg.type === 'SpreadElement') {
        const { temp } = this.visitExpression(arg.argument);
        spreadArray = temp;
      } else {
        const { temp, type } = this.visitExpression(arg);
        normalArgs.push({ temp, type });
      }
    }
    const t = this.newTemp();
    this.emit(OP.CALL_SPREAD, t, funcName, normalArgs, spreadArray);
    return { temp: t, type: TYPE_INT };
  }

  const args = [];
  for (const arg of node.arguments) {
    const { temp, type } = this.visitExpression(arg);
    args.push({ temp, type });
  }

  const t = this.newTemp();
  this.emit(OP.CALL, t, funcName, args);

  // Look up inferred return type for this function
  let retType = (this._functionReturnTypes && this._functionReturnTypes[funcName]) || TYPE_INT;
  // If function returns a parameter directly, use the argument's type from call site
  if (this._functionReturnParams && this._functionReturnParams[funcName] !== undefined) {
    const paramIdx = this._functionReturnParams[funcName];
    if (paramIdx < args.length) {
      retType = args[paramIdx].type;
    }
  }
  return { temp: t, type: retType };
}

function visitMathCall(method, argNodes) {
  const t = this.newTemp();

  if (method === 'abs') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_ABS, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'max') {
    const { temp: a } = this.visitExpression(argNodes[0]);
    const { temp: b } = this.visitExpression(argNodes[1]);
    this.emit(OP.MATH_MAX, t, a, b);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'min') {
    const { temp: a } = this.visitExpression(argNodes[0]);
    const { temp: b } = this.visitExpression(argNodes[1]);
    this.emit(OP.MATH_MIN, t, a, b);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'floor') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_FLOOR, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'pow') {
    const { temp: base } = this.visitExpression(argNodes[0]);
    const { temp: exp } = this.visitExpression(argNodes[1]);
    this.emit(OP.MATH_POW, t, base, exp);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'sqrt') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_SQRT, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'round') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_ROUND, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'ceil') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_CEIL, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'trunc') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_TRUNC, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'sign') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_SIGN, t, src);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'random') {
    this.emit(OP.MATH_RANDOM, t);
    return { temp: t, type: TYPE_INT };
  }
  if (method === 'log') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_LOG, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'log2') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_LOG2, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'sin') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_SIN, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'cos') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_COS, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'tan') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_TAN, t, src);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'atan2') {
    const { temp: y } = this.visitExpression(argNodes[0]);
    const { temp: x } = this.visitExpression(argNodes[1]);
    this.emit(OP.MATH_ATAN2, t, y, x);
    return { temp: t, type: TYPE_FLOAT };
  }
  if (method === 'clz32') {
    const { temp: src } = this.visitExpression(argNodes[0]);
    this.emit(OP.MATH_CLAMP32, t, src);
    return { temp: t, type: TYPE_INT };
  }

  throw new Error(`Unsupported Math method: Math.${method}`);
}

function visitUpdateExpression(node) {
  const rawName = node.argument.name;
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

  const t = this.newTemp();

  if (node.prefix) {
    if (node.operator === '++') {
      this.emit(OP.PRE_INC, t, name);
    } else {
      this.emit(OP.PRE_DEC, t, name);
    }
  } else {
    if (node.operator === '++') {
      this.emit(OP.POST_INC, t, name);
    } else {
      this.emit(OP.POST_DEC, t, name);
    }
  }

  return { temp: t, type: TYPE_INT };
}

function visitNewExpression(node) {
  // new ClassName(args...) → call the constructor function
  const className = node.callee.name;
  let funcName = className;

  // Resolve through importMap or qualified scope
  if (this.importMap.has(funcName)) {
    funcName = this.importMap.get(funcName);
  } else {
    const info = this.analyzer.currentScope.lookup(funcName);
    if (info && info.qualifiedName) {
      funcName = info.qualifiedName;
    }
  }

  const args = [];
  for (const arg of node.arguments) {
    const { temp, type } = this.visitExpression(arg);
    args.push({ temp, type });
  }

  const t = this.newTemp();
  this.emit(OP.CALL, t, funcName, args);
  return { temp: t, type: TYPE_INT, className };
}

function visitClassDeclaration(node) {
  const className = node.id.name;
  const qualifiedName = (!this.inFunction && this.moduleId) ? this.qualifyName(className) : className;

  // Handle extends
  let parentClassName = null;
  let parentQualifiedName = null;
  if (node.superClass) {
    parentClassName = node.superClass.name;
    const parentInfo = this.analyzer.currentScope.lookup(parentClassName);
    parentQualifiedName = (parentInfo && parentInfo.qualifiedName) || parentClassName;
  }

  // Register class name as a function in scope
  const classInfo = { type: TYPE_FUNCTION, isConst: true, qualifiedName, className };
  if (parentClassName) classInfo.parentClass = parentQualifiedName;
  this.analyzer.currentScope.declare(className, classInfo);

  // Store inheritance chain
  if (!this._classInheritance) this._classInheritance = {};
  if (parentClassName) {
    this._classInheritance[qualifiedName] = parentQualifiedName;
  }

  const methods = node.body.body; // ClassBody → MethodDefinition[]

  // Find constructor
  let constructorNode = null;
  const otherMethods = [];
  for (const method of methods) {
    if (method.kind === 'constructor') {
      constructorNode = method;
    } else {
      otherMethods.push(method);
    }
  }

  // Generate constructor function: ClassName(params...)
  // Creates empty object, sets properties via this.x = val, returns object
  {
    const ctorParams = constructorNode
      ? constructorNode.value.params.map(p => {
          if (p.type === 'AssignmentPattern') return p.left.name;
          return p.name;
        })
      : [];

    const func = new IRFunction(qualifiedName, ctorParams);
    func.restParamIndex = -1;
    this.program.functions.push(func);

    const prevInstructions = this.currentInstructions;
    const prevInFunction = this.inFunction;
    const prevSuperClass = this._currentSuperClass;
    this.currentInstructions = func.body;
    this.inFunction = true;
    this._currentSuperClass = parentQualifiedName;
    this.analyzer.enterScope();

    // Declare params
    if (constructorNode) {
      for (let i = 0; i < constructorNode.value.params.length; i++) {
        const p = constructorNode.value.params[i];
        const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
        this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
        this.emit(OP.PARAM, pName, i);

        if (p.type === 'AssignmentPattern') {
          const endDefLabel = this.newLabel('enddefparam');
          this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
          const { temp: defVal } = this.visitExpression(p.right);
          this.emit(OP.STORE_VAR, pName, defVal);
          this.emit(OP.LABEL, endDefLabel);
        }
      }
    }

    // Create empty object for 'this'
    const thisTemp = this.newTemp();
    this.emit(OP.OBJ_NEW, thisTemp, [], []);
    this.analyzer.currentScope.declare('this', { type: TYPE_INT, isConst: false, className });
    this.emit(OP.STORE_VAR, 'this', thisTemp);

    // Visit constructor body
    // super(args) calls are handled inside visitCallExpression via _currentSuperClass
    if (constructorNode) {
      for (const stmt of constructorNode.value.body.body) {
        this.visitStatement(stmt);
      }
    }

    // Return this
    const retTemp = this.newTemp();
    this.emit(OP.LOAD_VAR, retTemp, 'this');
    this.emit(OP.RETURN, retTemp);

    func.locals = [...this.analyzer.currentScope.variables.keys()];
    this.analyzer.exitScope();
    this.currentInstructions = prevInstructions;
    this.inFunction = prevInFunction;
    this._currentSuperClass = prevSuperClass;
  }

  // Generate method functions: ClassName_methodName(this, params...)
  for (const method of otherMethods) {
    if (method.type !== 'MethodDefinition') continue;
    const methodName = method.key.name || method.key.value;
    const fullName = `${qualifiedName}_${methodName}`;
    const isStatic = method.static;

    const methodParams = method.value.params.map(p => {
      if (p.type === 'AssignmentPattern') return p.left.name;
      return p.name;
    });
    // For non-static, 'this' is the first parameter; for static, no 'this'
    const allParams = isStatic ? methodParams : ['this', ...methodParams];

    const func = new IRFunction(fullName, allParams);
    func.restParamIndex = -1;
    this.program.functions.push(func);

    const prevInstructions = this.currentInstructions;
    const prevInFunction = this.inFunction;
    const prevSuperClass = this._currentSuperClass;
    this.currentInstructions = func.body;
    this.inFunction = true;
    this._currentSuperClass = parentQualifiedName;
    this.analyzer.enterScope();

    // Declare 'this' param (non-static only)
    if (!isStatic) {
      this.analyzer.currentScope.declare('this', { type: TYPE_INT, isConst: false, className });
      this.emit(OP.PARAM, 'this', 0);
    }

    // Declare method params
    const paramOffset = isStatic ? 0 : 1;
    for (let i = 0; i < method.value.params.length; i++) {
      const p = method.value.params[i];
      const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
      this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, pName, i + paramOffset);

      if (p.type === 'AssignmentPattern') {
        const endDefLabel = this.newLabel('enddefparam');
        this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
        const { temp: defVal } = this.visitExpression(p.right);
        this.emit(OP.STORE_VAR, pName, defVal);
        this.emit(OP.LABEL, endDefLabel);
      }
    }

    // Visit method body
    for (const stmt of method.value.body.body) {
      this.visitStatement(stmt);
    }

    func.locals = [...this.analyzer.currentScope.variables.keys()];
    this.analyzer.exitScope();
    this.currentInstructions = prevInstructions;
    this.inFunction = prevInFunction;
    this._currentSuperClass = prevSuperClass;
  }

  // Store method mapping info for method call resolution
  if (!this._classMethods) this._classMethods = {};
  this._classMethods[qualifiedName] = otherMethods.map(m => m.key.name || m.key.value);
  // Store getter/setter info
  if (!this._classGetters) this._classGetters = {};
  if (!this._classSetters) this._classSetters = {};
  this._classGetters[qualifiedName] = otherMethods
    .filter(m => m.kind === 'get')
    .map(m => m.key.name || m.key.value);
  this._classSetters[qualifiedName] = otherMethods
    .filter(m => m.kind === 'set')
    .map(m => m.key.name || m.key.value);
}

function _isArrayLike(node) {
  if (node.type === 'Identifier') {
    const info = this.analyzer.currentScope.lookup(node.name);
    return info && info.type === TYPE_ARRAY;
  }
  if (node.type === 'ArrayExpression') return true;
  return false;
}

function _emitObjectDestructuring(paramName, pattern) {
  for (const prop of pattern.properties) {
    const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
    const localName = prop.value.type === 'Identifier' ? prop.value.name : keyName;
    const keyLabel = this.program.addString(keyName);
    const paramTemp = this.newTemp();
    this.emit(OP.LOAD_VAR, paramTemp, paramName);
    const valTemp = this.newTemp();
    this.emit(OP.OBJ_GET, valTemp, paramTemp, keyLabel);
    this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst: false });
    this.emit(OP.STORE_VAR, localName, valTemp);
  }
}

function _emitArrayDestructuring(paramName, pattern) {
  for (let j = 0; j < pattern.elements.length; j++) {
    const elem = pattern.elements[j];
    if (!elem) continue; // skip holes
    const localName = elem.name;
    const paramTemp = this.newTemp();
    this.emit(OP.LOAD_VAR, paramTemp, paramName);
    const idxTemp = this.newTemp();
    this.emit(OP.LOAD_INT, idxTemp, j);
    const valTemp = this.newTemp();
    this.emit(OP.ARRAY_GET, valTemp, paramTemp, idxTemp);
    this.analyzer.currentScope.declare(localName, { type: TYPE_INT, isConst: false });
    this.emit(OP.STORE_VAR, localName, valTemp);
  }
}

function _isGetter(className, propName) {
  let cls = className;
  while (cls) {
    if (this._classGetters && this._classGetters[cls] && this._classGetters[cls].includes(propName)) {
      return true;
    }
    cls = (this._classInheritance && this._classInheritance[cls]) || null;
  }
  return false;
}

function _isSetter(className, propName) {
  let cls = className;
  while (cls) {
    if (this._classSetters && this._classSetters[cls] && this._classSetters[cls].includes(propName)) {
      return true;
    }
    cls = (this._classInheritance && this._classInheritance[cls]) || null;
  }
  return false;
}

function _resolveClassMethod(qualClsName, methodName) {
  // Walk the inheritance chain to find where the method is defined
  let cls = qualClsName;
  while (cls) {
    if (this._classMethods && this._classMethods[cls]) {
      if (this._classMethods[cls].includes(methodName)) {
        return `${cls}_${methodName}`;
      }
    }
    // Walk to parent
    cls = (this._classInheritance && this._classInheritance[cls]) || null;
  }
  // Default: assume it's on the current class (may fail at link time)
  return `${qualClsName}_${methodName}`;
}

function _resolveCallbackName(callbackNode) {
  if (callbackNode.type === 'ArrowFunctionExpression') {
    const result = this.visitArrowFunction(callbackNode);
    return result.funcName;
  }
  if (callbackNode.type === 'FunctionExpression') {
    const result = this.visitFunctionExpression(callbackNode);
    return result.funcName;
  }
  if (callbackNode.type === 'Identifier') {
    const info = this.analyzer.currentScope.lookup(callbackNode.name);
    if (info && info.qualifiedName) return info.qualifiedName;
    return callbackNode.name;
  }
  throw new Error(`Unsupported callback type: ${callbackNode.type}`);
}

module.exports = {
  visitFunctionDeclaration,
  visitArrowFunction,
  visitFunctionExpression,
  visitCallExpression,
  visitMathCall,
  visitUpdateExpression,
  visitNewExpression,
  visitClassDeclaration,
  _isArrayLike,
  _isGetter,
  _isSetter,
  _resolveClassMethod,
  _resolveCallbackName,
  _emitObjectDestructuring,
  _emitArrayDestructuring,
};
