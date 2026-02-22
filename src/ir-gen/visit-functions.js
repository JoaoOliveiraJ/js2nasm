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

  const params = regularParams.map(p => {
    if (p.type === 'AssignmentPattern') return p.left.name;
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

  // Declare regular params (with default values support)
  for (let i = 0; i < regularParams.length; i++) {
    const p = regularParams[i];
    const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
    this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
    this.emit(OP.PARAM, pName, i);

    // Default parameter value
    if (p.type === 'AssignmentPattern') {
      const endDefLabel = this.newLabel('enddefparam');
      this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
      const { temp: defVal } = this.visitExpression(p.right);
      this.emit(OP.STORE_VAR, pName, defVal);
      this.emit(OP.LABEL, endDefLabel);
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

  const params = regularParams.map(p => {
    if (p.type === 'AssignmentPattern') return p.left.name;
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

  // Declare regular params (with default values)
  for (let i = 0; i < regularParams.length; i++) {
    const p = regularParams[i];
    const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
    this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
    this.emit(OP.PARAM, pName, i);

    // Default parameter value
    if (p.type === 'AssignmentPattern') {
      const endDefLabel = this.newLabel('enddefparam');
      this.emit(OP.JUMP_IF_NOT_UNDEF, pName, endDefLabel);
      const { temp: defVal } = this.visitExpression(p.right);
      this.emit(OP.STORE_VAR, pName, defVal);
      this.emit(OP.LABEL, endDefLabel);
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
  return { temp: t, type: TYPE_FUNCTION };
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
    }

    // Array.isArray()
    if (obj.type === 'Identifier' && obj.name === 'Array' && propName === 'isArray') {
      const { temp: valTemp } = this.visitExpression(node.arguments[0]);
      const t = this.newTemp();
      this.emit(OP.ARRAY_IS_ARRAY, t, valTemp);
      return { temp: t, type: TYPE_BOOL };
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

    // Class method calls: obj.method(args) → ClassName_method(obj, args...)
    if (obj.type === 'Identifier') {
      const objInfo = this.analyzer.currentScope.lookup(obj.name);
      if (objInfo && objInfo.className) {
        const clsName = objInfo.qualifiedName ? objInfo.className : objInfo.className;
        // Resolve qualified class name
        let qualClsName = clsName;
        const clsInfo = this.analyzer.currentScope.lookup(clsName);
        if (clsInfo && clsInfo.qualifiedName) {
          qualClsName = clsInfo.qualifiedName;
        }
        const fullMethodName = `${qualClsName}_${propName}`;
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
        const fullMethodName = `${qualClsName}_${propName}`;
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

  // Regular function call
  let funcName = node.callee.name;

  // Resolve through importMap or qualified scope
  if (this.importMap.has(funcName)) {
    funcName = this.importMap.get(funcName);
  } else {
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

  // Register class name as a function in scope
  this.analyzer.currentScope.declare(className, { type: TYPE_FUNCTION, isConst: true, qualifiedName, className });

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
    this.currentInstructions = func.body;
    this.inFunction = true;
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
  }

  // Generate method functions: ClassName_methodName(this, params...)
  for (const method of otherMethods) {
    if (method.type !== 'MethodDefinition') continue;
    const methodName = method.key.name || method.key.value;
    const fullName = `${qualifiedName}_${methodName}`;

    const methodParams = method.value.params.map(p => {
      if (p.type === 'AssignmentPattern') return p.left.name;
      return p.name;
    });
    // 'this' is the first parameter
    const allParams = ['this', ...methodParams];

    const func = new IRFunction(fullName, allParams);
    func.restParamIndex = -1;
    this.program.functions.push(func);

    const prevInstructions = this.currentInstructions;
    const prevInFunction = this.inFunction;
    this.currentInstructions = func.body;
    this.inFunction = true;
    this.analyzer.enterScope();

    // Declare 'this' param
    this.analyzer.currentScope.declare('this', { type: TYPE_INT, isConst: false, className });
    this.emit(OP.PARAM, 'this', 0);

    // Declare method params
    for (let i = 0; i < method.value.params.length; i++) {
      const p = method.value.params[i];
      const pName = p.type === 'AssignmentPattern' ? p.left.name : p.name;
      this.analyzer.currentScope.declare(pName, { type: TYPE_INT, isConst: false });
      this.emit(OP.PARAM, pName, i + 1); // +1 because this is param 0

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
  }

  // Store method mapping info for method call resolution
  // We track which methods belong to which class
  if (!this._classMethods) this._classMethods = {};
  this._classMethods[qualifiedName] = otherMethods.map(m => m.key.name || m.key.value);
}

function _isArrayLike(node) {
  if (node.type === 'Identifier') {
    const info = this.analyzer.currentScope.lookup(node.name);
    return info && info.type === TYPE_ARRAY;
  }
  if (node.type === 'ArrayExpression') return true;
  return false;
}

module.exports = {
  visitFunctionDeclaration,
  visitArrowFunction,
  visitCallExpression,
  visitMathCall,
  visitUpdateExpression,
  visitNewExpression,
  visitClassDeclaration,
  _isArrayLike,
};
