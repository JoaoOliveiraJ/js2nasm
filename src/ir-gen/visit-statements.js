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
        const elemName = elem.name;
        const name = (!this.inFunction && this.moduleId) ? this.qualifyName(elemName) : elemName;
        const idxTemp = this.newTemp();
        this.emit(OP.LOAD_INT, idxTemp, i);
        const valTemp = this.newTemp();
        this.emit(OP.ARRAY_GET, valTemp, arrTemp, idxTemp);
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
        const keyName = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
        const localName = prop.value.type === 'Identifier' ? prop.value.name : prop.key.name;
        const name = (!this.inFunction && this.moduleId) ? this.qualifyName(localName) : localName;
        const keyLabel = this.program.addString(keyName);
        const valTemp = this.newTemp();
        this.emit(OP.OBJ_GET, valTemp, objTemp, keyLabel);
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

  // Member assignment: arr[i] = val, obj.prop = val, obj["key"] = val
  if (node.left.type === 'MemberExpression') {
    const { temp: objTemp } = this.visitExpression(node.left.object);
    const { temp: valTemp } = this.visitExpression(node.right);

    if (node.left.computed) {
      const prop = node.left.property;
      // String key → object set
      if (prop.type === 'Literal' && typeof prop.value === 'string') {
        const keyLabel = this.program.addString(prop.value);
        this.emit(OP.OBJ_SET, objTemp, keyLabel, valTemp);
        return { temp: valTemp, type: TYPE_INT };
      }
      // Numeric → array set
      const { temp: idxTemp } = this.visitExpression(prop);
      this.emit(OP.ARRAY_SET, objTemp, idxTemp, valTemp);
      return { temp: valTemp, type: TYPE_INT };
    }

    // Non-computed: obj.prop = val
    if (node.left.property.type === 'Identifier') {
      const keyLabel = this.program.addString(node.left.property.name);
      this.emit(OP.OBJ_SET, objTemp, keyLabel, valTemp);
      return { temp: valTemp, type: TYPE_INT };
    }

    const { temp: idxTemp } = this.visitExpression(node.left.property);
    this.emit(OP.ARRAY_SET, objTemp, idxTemp, valTemp);
    return { temp: valTemp, type: TYPE_INT };
  }

  throw new Error(`Unsupported assignment: ${node.operator} to ${node.left.type}`);
}

module.exports = {
  visitVariableDeclaration,
  visitExpressionStatement,
  visitAssignment,
  visitConsoleLog,
  visitConsoleError,
  visitProcessExit,
};
