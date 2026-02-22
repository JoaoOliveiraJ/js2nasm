'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

/**
 * Resolve imports de módulos ES recursivamente a partir de um arquivo de entrada.
 * Constrói um grafo de dependências, realiza ordenação topológica e detecta ciclos.
 */
class ModuleResolver {
  constructor() {
    this.modules = new Map(); // absPath → ModuleInfo
    this.order = [];          // absPath[] ordenados topologicamente
    this.nextId = 0;
  }

  /**
   * Resolve todos os módulos a partir do arquivo de entrada.
   * Retorna { modules: Map<absPath, ModuleInfo>, order: string[] }
   *
   * ModuleInfo: { id: 'mod0', absPath, source, ast, exports: Map, imports: [] }
   */
  resolve(entryPath) {
    const absEntry = path.resolve(entryPath);
    if (!fs.existsSync(absEntry)) {
      throw new Error(`Arquivo de entrada não encontrado: ${absEntry}`);
    }

    // Verifica se a entrada usa sintaxe de módulos
    const entrySource = fs.readFileSync(absEntry, 'utf-8');
    if (!this._usesModuleSyntax(entrySource)) {
      return null; // sinal: usar caminho de arquivo único
    }

    // DFS para descobrir todos os módulos
    const visiting = new Set(); // detecção de ciclos (nós cinza)
    const visited = new Set();  // totalmente processado (nós pretos)

    this._visit(absEntry, visiting, visited);

    return {
      modules: this.modules,
      order: this.order, // dependências primeiro, entrada por último
    };
  }

  _visit(absPath, visiting, visited) {
    if (visited.has(absPath)) return;

    if (visiting.has(absPath)) {
      throw new Error(`Dependência circular detectada envolvendo: ${absPath}`);
    }

    visiting.add(absPath);

    const source = fs.readFileSync(absPath, 'utf-8');
    const ast = acorn.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
    });

    const moduleInfo = {
      id: `mod${this.nextId++}`,
      absPath,
      source,
      ast,
      exports: new Map(),  // nomeExportado → nomeLocal
      imports: [],          // { from: absPath, specifiers: [{imported, local}] }
    };

    // Escaneia imports e exports
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        const fromPath = this._resolveSpecifier(node.source.value, absPath);
        const specifiers = [];
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            specifiers.push({
              imported: spec.imported.name,
              local: spec.local.name,
            });
          } else if (spec.type === 'ImportDefaultSpecifier') {
            specifiers.push({
              imported: 'default',
              local: spec.local.name,
            });
          }
        }
        moduleInfo.imports.push({ from: fromPath, specifiers });

        // Recursa na dependência
        this._visit(fromPath, visiting, visited);
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration') {
            const name = node.declaration.id.name;
            moduleInfo.exports.set(name, name);
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const decl of node.declaration.declarations) {
              moduleInfo.exports.set(decl.id.name, decl.id.name);
            }
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            moduleInfo.exports.set(spec.exported.name, spec.local.name);
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
          moduleInfo.exports.set('default', node.declaration.id.name);
        } else if (node.declaration.type === 'Identifier') {
          moduleInfo.exports.set('default', node.declaration.name);
        } else {
          // export default anônimo — atribui um nome sintético
          moduleInfo.exports.set('default', `_default_${moduleInfo.id}`);
        }
      }
    }

    this.modules.set(absPath, moduleInfo);

    visiting.delete(absPath);
    visited.add(absPath);
    this.order.push(absPath); // pós-ordem = ordem topológica
  }

  /**
   * Resolve um especificador relativo para um caminho absoluto.
   * Adiciona extensão .js se estiver faltando.
   */
  _resolveSpecifier(specifier, fromPath) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      throw new Error(`Especificadores bare não suportados: '${specifier}' em ${fromPath}`);
    }

    const dir = path.dirname(fromPath);
    let resolved = path.resolve(dir, specifier);

    // Adiciona .js se estiver faltando
    if (!path.extname(resolved)) {
      resolved += '.js';
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`Módulo não encontrado: '${specifier}' (resolvido para ${resolved}) importado de ${fromPath}`);
    }

    return resolved;
  }

  /**
   * Verificação rápida: o código fonte contém declarações import ou export?
   */
  _usesModuleSyntax(source) {
    // Tenta fazer parsing como módulo e verifica nós de import/export
    try {
      const ast = acorn.parse(source, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
      });
      for (const node of ast.body) {
        if (node.type === 'ImportDeclaration' ||
            node.type === 'ExportNamedDeclaration' ||
            node.type === 'ExportDefaultDeclaration' ||
            node.type === 'ExportAllDeclaration') {
          return true;
        }
      }
    } catch (e) {
      // Não é sintaxe de módulo válida — tratar como script
    }
    return false;
  }
}

module.exports = { ModuleResolver };
