'use strict';

const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_UNDEFINED, TYPE_NULL, TYPE_ARRAY, TYPE_FUNCTION } = require('./types');

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.variables = new Map(); // nome → { type, offset, isConst }
    this.depth = parent ? parent.depth + 1 : 0;
  }

  declare(name, info) {
    if (this.variables.has(name)) {
      throw new Error(`Variável '${name}' já declarada neste escopo`);
    }
    this.variables.set(name, info);
  }

  lookup(name) {
    if (this.variables.has(name)) {
      return { ...this.variables.get(name), scope: this };
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    return null;
  }

  lookupLocal(name) {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    return null;
  }
}

class Analyzer {
  constructor() {
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    this.functions = new Map(); // nomeFunção → { params, scope }
    this.errors = [];
  }

  enterScope() {
    this.currentScope = new Scope(this.currentScope);
    return this.currentScope;
  }

  exitScope() {
    const old = this.currentScope;
    this.currentScope = this.currentScope.parent;
    return old;
  }

  inferType(node) {
    switch (node.type) {
      case 'Literal':
        if (typeof node.value === 'number') {
          return Number.isInteger(node.value) ? TYPE_INT : TYPE_FLOAT;
        }
        if (typeof node.value === 'string') return TYPE_STRING;
        if (typeof node.value === 'boolean') return TYPE_BOOL;
        if (node.value === null) return TYPE_NULL;
        return TYPE_UNDEFINED;

      case 'BinaryExpression':
        if (node.operator === '+') {
          const lt = this.inferType(node.left);
          const rt = this.inferType(node.right);
          if (lt === TYPE_STRING || rt === TYPE_STRING) return TYPE_STRING;
          if (lt === TYPE_FLOAT || rt === TYPE_FLOAT) return TYPE_FLOAT;
          return TYPE_INT;
        }
        if (['-', '*', '/', '%', '**'].includes(node.operator)) {
          const lt = this.inferType(node.left);
          const rt = this.inferType(node.right);
          if (lt === TYPE_FLOAT || rt === TYPE_FLOAT) return TYPE_FLOAT;
          return TYPE_INT;
        }
        if (['<', '>', '<=', '>=', '==', '===', '!=', '!=='].includes(node.operator)) {
          return TYPE_BOOL;
        }
        return TYPE_INT;

      case 'LogicalExpression':
        return TYPE_BOOL;

      case 'UnaryExpression':
        if (node.operator === '!') return TYPE_BOOL;
        if (node.operator === '-') return this.inferType(node.argument);
        return TYPE_INT;

      case 'Identifier': {
        const info = this.currentScope.lookup(node.name);
        return info ? info.type : TYPE_UNDEFINED;
      }

      case 'CallExpression':
        return TYPE_INT; // padrão; poderia ser melhorado

      case 'ConditionalExpression':
        return this.inferType(node.consequent);

      case 'TemplateLiteral':
        return TYPE_STRING;

      case 'ArrayExpression':
        return TYPE_ARRAY;

      case 'MemberExpression':
        if (node.property.type === 'Identifier' && node.property.name === 'length') {
          return TYPE_INT;
        }
        return TYPE_INT; // acesso a elemento de array

      default:
        return TYPE_UNDEFINED;
    }
  }

  error(msg, node) {
    const loc = node && node.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : '';
    this.errors.push(`Error${loc}: ${msg}`);
  }
}

module.exports = { Analyzer, Scope };
