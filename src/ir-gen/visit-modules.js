'use strict';

const { OP } = require('../ir');

function visitExportNamedDeclaration(node) {
  // `export function foo() {}` ou `export const x = 1;`
  if (node.declaration) {
    this.visitStatement(node.declaration);
  }
  // `export { a, b }` — nomes já qualificados via visitVariableDeclaration/visitFunctionDeclaration
}

function visitExportDefaultDeclaration(node) {
  if (node.declaration.type === 'FunctionDeclaration') {
    this.visitFunctionDeclaration(node.declaration);
  } else {
    // Export default de expressão — trata como atribuição de variável
    const { temp } = this.visitExpression(node.declaration);
    const name = this.qualifyName(`_default_${this.moduleId}`);
    if (!this.inFunction) {
      this.program.globals.add(name);
    }
    this.emit(OP.STORE_VAR, name, temp);
  }
}

function _buildImportMap() {
  for (const imp of this.moduleInfo.imports) {
    const depInfo = this.allModules.get(imp.from);
    if (!depInfo) continue;
    for (const spec of imp.specifiers) {
      // spec.imported é o nome exportado pela dependência
      // spec.local é o nome usado neste módulo
      const exportedLocal = depInfo.exports.get(spec.imported);
      if (exportedLocal === undefined) {
        throw new Error(`Module '${depInfo.absPath}' does not export '${spec.imported}'`);
      }
      const qualifiedName = `${depInfo.id}__${exportedLocal}`;
      this.importMap.set(spec.local, qualifiedName);
    }
  }
}

module.exports = {
  visitExportNamedDeclaration,
  visitExportDefaultDeclaration,
  _buildImportMap,
};
