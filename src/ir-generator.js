'use strict';

const { Analyzer } = require('./analyzer');
const { IRProgram, IRFunction, IRInstruction, OP } = require('./ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY, TYPE_FUNCTION } = require('./types');

class IRGenerator {
  /**
   * @param {string} [moduleId] - e.g. 'mod0'. If omitted, single-file mode (no mangling).
   * @param {object} [moduleInfo] - { exports: Map, imports: [] } from ModuleResolver.
   * @param {Map}    [allModules] - full modules map so we can resolve imported names.
   */
  constructor(moduleId, moduleInfo, allModules) {
    this.analyzer = new Analyzer();
    this.program = new IRProgram();
    this.currentInstructions = null; // points to current function body or main
    this.tempCounter = 0;
    this.labelCounter = 0;
    this.loopStack = []; // { continueLabel, breakLabel }
    this.inFunction = false; // true when generating code inside a function

    // Module support
    this.moduleId = moduleId || null;       // null = single-file mode
    this.moduleInfo = moduleInfo || null;
    this.allModules = allModules || null;
    this.importMap = new Map();             // localName → qualified name from other module

    if (this.moduleId && this.moduleInfo) {
      this._buildImportMap();
    }
  }

  /**
   * Qualify a top-level name with the module prefix.
   * In single-file mode (no moduleId) returns name unchanged.
   */
  qualifyName(name) {
    if (!this.moduleId) return name;
    return `${this.moduleId}__${name}`;
  }

  newTemp() {
    if (this.moduleId) {
      return `_${this.moduleId}_t${this.tempCounter++}`;
    }
    return `_t${this.tempCounter++}`;
  }

  newLabel(prefix = 'L') {
    if (this.moduleId) {
      return `.${this.moduleId}_${prefix}_${this.labelCounter++}`;
    }
    return `.${prefix}_${this.labelCounter++}`;
  }

  emit(op, ...operands) {
    this.currentInstructions.push(new IRInstruction(op, ...operands));
  }

  generate(ast) {
    this.currentInstructions = this.program.main;

    for (const node of ast.body) {
      // Module-level declarations handled specially
      if (node.type === 'ImportDeclaration') {
        // Imports are resolved via importMap — nothing to emit
        continue;
      }
      if (node.type === 'ExportNamedDeclaration') {
        this.visitExportNamedDeclaration(node);
        continue;
      }
      if (node.type === 'ExportDefaultDeclaration') {
        this.visitExportDefaultDeclaration(node);
        continue;
      }
      this.visitStatement(node);
    }

    return this.program;
  }

  visitStatement(node) {
    switch (node.type) {
      case 'VariableDeclaration':
        return this.visitVariableDeclaration(node);
      case 'ExpressionStatement':
        return this.visitExpressionStatement(node);
      case 'FunctionDeclaration':
        return this.visitFunctionDeclaration(node);
      case 'ReturnStatement':
        return this.visitReturnStatement(node);
      case 'IfStatement':
        return this.visitIfStatement(node);
      case 'WhileStatement':
        return this.visitWhileStatement(node);
      case 'DoWhileStatement':
        return this.visitDoWhileStatement(node);
      case 'ForStatement':
        return this.visitForStatement(node);
      case 'ForOfStatement':
        return this.visitForOfStatement(node);
      case 'SwitchStatement':
        return this.visitSwitchStatement(node);
      case 'BreakStatement':
        return this.visitBreakStatement(node);
      case 'ContinueStatement':
        return this.visitContinueStatement(node);
      case 'TryStatement':
        return this.visitTryStatement(node);
      case 'ThrowStatement':
        return this.visitThrowStatement(node);
      case 'ClassDeclaration':
        return this.visitClassDeclaration(node);
      case 'BlockStatement':
        for (const stmt of node.body) {
          this.visitStatement(stmt);
        }
        return;
      case 'EmptyStatement':
        return;
      default:
        throw new Error(this._unsupportedError(node));
    }
  }

  _unsupportedError(node) {
    const line = node.loc ? node.loc.start.line : '?';
    const hints = {
      'ObjectExpression': 'Object literal syntax error. Only simple { key: value } properties are supported.',
      'ClassExpression': 'Class expressions are not supported. Use class declarations instead.',
      'YieldExpression': 'Generators (yield) are not supported.',
      'AwaitExpression': 'async/await is not supported.',
      'TaggedTemplateExpression': 'Tagged templates are not supported.',
      'ForInStatement': 'for...in is not supported. Use for...of with arrays instead.',
      'WithStatement': '`with` is not supported.',
      'LabeledStatement': 'Labeled statements are not supported.',
      'ImportExpression': 'Dynamic import() is not supported. Use static import declarations.',
      'MetaProperty': 'import.meta is not supported.',
    };
    const hint = hints[node.type];
    if (hint) {
      return `${hint} (line ${line})`;
    }
    return `Unsupported syntax: ${node.type} at line ${line}`;
  }
}

// Mixin extracted methods onto prototype
const visitExpressions = require('./ir-gen/visit-expressions');
const visitStatements  = require('./ir-gen/visit-statements');
const visitFunctions   = require('./ir-gen/visit-functions');
const visitControlFlow = require('./ir-gen/visit-control-flow');
const visitCollections = require('./ir-gen/visit-collections');
const visitModules     = require('./ir-gen/visit-modules');

Object.assign(IRGenerator.prototype,
  visitExpressions,
  visitStatements,
  visitFunctions,
  visitControlFlow,
  visitCollections,
  visitModules,
);

module.exports = { IRGenerator };
