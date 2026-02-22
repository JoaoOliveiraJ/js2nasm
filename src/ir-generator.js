'use strict';

const { Analyzer } = require('./analyzer');
const { IRProgram, IRFunction, IRInstruction, OP } = require('./ir');
const { TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_BOOL, TYPE_ARRAY, TYPE_FUNCTION } = require('./types');

class IRGenerator {
  /**
   * @param {string} [moduleId] - ex.: 'mod0'. Se omitido, modo arquivo único (sem mangling).
   * @param {object} [moduleInfo] - { exports: Map, imports: [] } do ModuleResolver.
   * @param {Map}    [allModules] - mapa completo de módulos para resolver nomes importados.
   */
  constructor(moduleId, moduleInfo, allModules) {
    this.analyzer = new Analyzer();
    this.program = new IRProgram();
    this.currentInstructions = null; // aponta para o corpo da função atual ou main
    this.tempCounter = 0;
    this.labelCounter = 0;
    this.loopStack = []; // { continueLabel, breakLabel } — pilha de loops
    this.inFunction = false; // true quando gerando código dentro de uma função

    // Suporte a módulos
    this.moduleId = moduleId || null;       // null = modo arquivo único
    this.moduleInfo = moduleInfo || null;
    this.allModules = allModules || null;
    this.importMap = new Map();             // localName → nome qualificado de outro módulo

    if (this.moduleId && this.moduleInfo) {
      this._buildImportMap();
    }
  }

  /**
   * Qualifica um nome de nível superior com o prefixo do módulo.
   * No modo arquivo único (sem moduleId) retorna o nome sem mudança.
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
      // Declarações de nível de módulo tratadas especialmente
      if (node.type === 'ImportDeclaration') {
        // Imports são resolvidos via importMap — nada a emitir
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
      case 'ForInStatement':
        return this.visitForInStatement(node);
      case 'LabeledStatement':
        return this.visitLabeledStatement(node);
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
      'ObjectExpression': 'Erro de sintaxe em literal de objeto. Apenas propriedades simples { key: value } são suportadas.',
      'ClassExpression': 'Expressões de classe não são suportadas. Use declarações de classe.',
      'YieldExpression': 'Generators (yield) não são suportados.',
      'AwaitExpression': 'async/await não é suportado.',
      'TaggedTemplateExpression': 'Tagged templates não são suportados.',
      'WithStatement': '`with` não é suportado.',
      'ImportExpression': 'import() dinâmico não é suportado. Use declarações de import estáticas.',
      'MetaProperty': 'import.meta não é suportado.',
    };
    const hint = hints[node.type];
    if (hint) {
      return `${hint} (linha ${line})`;
    }
    return `Sintaxe não suportada: ${node.type} na linha ${line}`;
  }
}

// Aplica métodos extraídos no prototype via mixin
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
