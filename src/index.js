'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { generate } = require('astring');
const { IRGenerator } = require('./ir-generator');
const { IRProgram } = require('./ir');
const { CodeGenerator } = require('./codegen');
const { ModuleResolver } = require('./module-resolver');

/**
 * Transpila uma única string de código JS (retrocompatível, sem suporte a módulos).
 */
function transpile(source, options = {}) {
  // 1. Parseia JS → AST usando acorn
  const ast = acorn.parse(source, {
    ecmaVersion: 2022,
    sourceType: 'script',
    locations: true,
  });

  if (options.emitAst) {
    return { ast, astString: JSON.stringify(ast, null, 2) };
  }

  // 2. Gera IR a partir do AST
  const irGen = new IRGenerator();
  const ir = irGen.generate(ast);

  if (options.emitIr) {
    return { ir, irString: formatIR(ir) };
  }

  // 3. Gera NASM a partir do IR
  const codegen = new CodeGenerator(ir);
  const asm = codegen.generate();

  return { asm, ir, ast };
}

/**
 * Transpila um projeto a partir de um arquivo de entrada.
 * Resolve importações de módulos ES recursivamente e mescla em um único IR.
 * Volta para transpile() de arquivo único se nenhuma sintaxe de módulo for detectada.
 */
function transpileProject(entryPath, options = {}) {
  const absEntry = path.resolve(entryPath);
  const source = fs.readFileSync(absEntry, 'utf-8');

  // Tenta resolver módulos
  const resolver = new ModuleResolver();
  const resolved = resolver.resolve(absEntry);

  // Sem sintaxe de módulo — volta para transpile de arquivo único
  if (!resolved) {
    return transpile(source, options);
  }

  const { modules, order } = resolved;

  if (options.emitAst) {
    // Mostra AST apenas para o módulo de entrada
    const entryInfo = modules.get(absEntry);
    return { ast: entryInfo.ast, astString: JSON.stringify(entryInfo.ast, null, 2) };
  }

  // Gera IR por módulo em ordem topológica
  const moduleIRs = [];
  for (const absPath of order) {
    const modInfo = modules.get(absPath);
    const irGen = new IRGenerator(modInfo.id, modInfo, modules);
    const ir = irGen.generate(modInfo.ast);
    moduleIRs.push({ moduleInfo: modInfo, ir });
  }

  // Mescla todos os IRs
  const mergedIR = mergeIRPrograms(moduleIRs);

  if (options.emitIr) {
    return { ir: mergedIR, irString: formatIR(mergedIR) };
  }

  // Gera NASM a partir do IR mesclado
  const codegen = new CodeGenerator(mergedIR);
  const asm = codegen.generate();

  return { asm, ir: mergedIR };
}

/**
 * Mescla múltiplos IRs de módulos em um único IRProgram.
 * A ordem é topológica (dependências primeiro, entrada por último).
 */
function mergeIRPrograms(moduleIRs) {
  const merged = new IRProgram();

  for (const { ir } of moduleIRs) {
    // Mescla funções
    for (const func of ir.functions) {
      merged.functions.push(func);
    }

    // Mescla main (código de nível superior) em ordem topológica
    for (const inst of ir.main) {
      merged.main.push(inst);
    }

    // Mescla strings (deduplicando por valor)
    for (const s of ir.strings) {
      const existing = merged.strings.find(ms => ms.value === s.value);
      if (!existing) {
        merged.strings.push({ label: s.label, value: s.value });
      }
      // Nota: os labels permanecem como emitidos pelo IRGenerator de cada módulo.
      // Como cada módulo tem seu próprio contador de strings, os labels não colidem.
    }

    // Mescla floats (deduplicando por valor)
    for (const f of ir.floats) {
      const existing = merged.floats.find(mf => mf.value === f.value);
      if (!existing) {
        merged.floats.push({ label: f.label, value: f.value });
      }
    }

    // Mescla globais
    for (const g of ir.globals) {
      merged.globals.add(g);
    }
  }

  return merged;
}

function formatIR(ir) {
  const lines = [];

  // Funções
  for (const func of ir.functions) {
    lines.push(`function ${func.name}(${func.params.join(', ')}):`);
    for (const inst of func.body) {
      lines.push(`  ${inst.toString()}`);
    }
    lines.push('');
  }

  // Principal
  lines.push('main:');
  for (const inst of ir.main) {
    lines.push(`  ${inst.toString()}`);
  }

  // Dados
  if (ir.strings.length > 0) {
    lines.push('\nstrings:');
    for (const s of ir.strings) {
      lines.push(`  ${s.label} = "${s.value}"`);
    }
  }

  if (ir.floats.length > 0) {
    lines.push('\nfloats:');
    for (const f of ir.floats) {
      lines.push(`  ${f.label} = ${f.value}`);
    }
  }

  return lines.join('\n');
}

module.exports = { transpile, transpileProject };
