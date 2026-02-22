#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const { transpile, transpileProject } = require('../src/index.js');

// ---------------------------------------------------------------------------
// Tool discovery helpers
// ---------------------------------------------------------------------------

/**
 * Try to find NASM by checking PATH first, then common install locations.
 * Returns the full path to nasm.exe or null if not found.
 */
function findNasm() {
  // 1. Check if nasm is available on PATH
  try {
    const out = execSync('where nasm', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (out) {
      const first = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) return first;
    }
  } catch (_) { /* not on PATH */ }

  // 2. Check common install location
  const common = 'C:\\Program Files\\NASM\\nasm.exe';
  if (fs.existsSync(common)) return common;

  return null;
}

/**
 * Try to find GoLink by checking PATH first, then the project's tools/ dir.
 * Returns the full path to GoLink.exe or null if not found.
 */
function findGoLink() {
  // 1. Check if golink is available on PATH
  try {
    const out = execSync('where golink', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (out) {
      const first = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) return first;
    }
  } catch (_) { /* not on PATH */ }

  // 2. Check project-local tools directory (relative to this script's bin/)
  const projectRoot = path.resolve(__dirname, '..');
  const local = path.join(projectRoot, 'tools', 'golink', 'GoLink.exe');
  if (fs.existsSync(local)) return local;

  return null;
}

// ---------------------------------------------------------------------------
// Compile (assemble + link) helper
// ---------------------------------------------------------------------------

/**
 * Assemble with NASM and link with GoLink (or MSVC link).
 * Returns the path to the resulting .exe, or null on failure.
 */
function compileOnly(asmPath, linker) {
  const baseName = path.basename(asmPath, '.asm');
  const dir = path.dirname(asmPath);
  const objPath = path.join(dir, `${baseName}.obj`);
  const exePath = path.join(dir, `${baseName}.exe`);

  // --- locate NASM ---
  const nasmPath = findNasm();
  if (!nasmPath) {
    console.warn(chalk.yellow('Aviso: NASM não encontrado. Pulando compilação.'));
    console.warn(chalk.yellow('  Instale NASM e coloque-o no PATH, ou instale em C:\\Program Files\\NASM'));
    return null;
  }

  // --- locate linker ---
  let linkerPath = null;
  if (linker === 'golink') {
    linkerPath = findGoLink();
    if (!linkerPath) {
      console.warn(chalk.yellow('Aviso: GoLink não encontrado. Pulando linkagem.'));
      console.warn(chalk.yellow('  Coloque GoLink.exe no PATH ou em tools/golink/ dentro do projeto.'));
      return null;
    }
  }
  // For MSVC we just rely on 'link' being on PATH (Visual Studio dev prompt).

  try {
    // 1. Assemble
    console.log(chalk.blue(`[1/2] Assemblando com NASM...`));
    execSync(`"${nasmPath}" -f win64 "${asmPath}" -o "${objPath}"`, {
      stdio: 'inherit',
      cwd: dir,
    });
    console.log(chalk.green(`      Objeto gerado: ${objPath}`));

    // 2. Link
    console.log(chalk.blue(`[2/2] Linkando com ${linker}...`));
    if (linker === 'golink') {
      execSync(`"${linkerPath}" /entry:main /console "${objPath}" kernel32.dll msvcrt.dll`, {
        stdio: 'inherit',
        cwd: dir,
      });
    } else {
      execSync(`link "${objPath}" /subsystem:console /entry:main kernel32.lib msvcrt.lib /nologo`, {
        stdio: 'inherit',
        cwd: dir,
      });
    }

    console.log(chalk.green(`      Executável gerado: ${exePath}`));

    // 3. Clean up .obj
    try {
      fs.unlinkSync(objPath);
    } catch (_) { /* ignore cleanup errors */ }

    return exePath;
  } catch (err) {
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(chalk.red(err.stderr));
    console.error(chalk.red(`Falha na compilação: ${err.message}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('js2nasm')
  .description('Transpila JavaScript para NASM x86-64 Windows')
  .version('1.0.0')
  .argument('<input>', 'Arquivo .js de entrada')
  .option('-o, --output <file>', 'Arquivo .asm de saída')
  .option('--run', 'Transpila + compila + executa')
  .option('--no-compile', 'Apenas gera o .asm (não assembla/linka)')
  .option('--emit-ast', 'Mostra o AST (debug)')
  .option('--emit-ir', 'Mostra a IR intermediária (debug)')
  .option('--linker <linker>', 'Linker: golink ou msvc (default: golink)', 'golink')
  .action((input, options) => {
    try {
      // 1. Read JS file
      const inputPath = path.resolve(input);
      if (!fs.existsSync(inputPath)) {
        console.error(chalk.red(`Erro: arquivo não encontrado: ${inputPath}`));
        process.exit(1);
      }

      const baseName = path.basename(inputPath, '.js');
      const dir = path.dirname(inputPath);

      console.log(chalk.blue(`Transpilando ${path.basename(inputPath)}...`));

      // 2. Transpile (multi-file aware)
      const result = transpileProject(inputPath, {
        emitAst: options.emitAst,
        emitIr: options.emitIr,
      });

      // 3. Handle debug modes
      if (options.emitAst) {
        console.log(chalk.yellow('\n=== AST ==='));
        console.log(result.astString);
        return;
      }

      if (options.emitIr) {
        console.log(chalk.yellow('\n=== IR ==='));
        console.log(result.irString);
        return;
      }

      // 4. Save .asm
      const asmPath = options.output
        ? path.resolve(options.output)
        : path.join(dir, `${baseName}.asm`);

      fs.writeFileSync(asmPath, result.asm, 'utf-8');
      console.log(chalk.green(`Arquivo NASM gerado: ${asmPath}`));

      // 5. Auto-compile (unless --no-compile)
      if (options.compile === false) {
        // --no-compile was passed; stop here
        return;
      }

      const exePath = compileOnly(asmPath, options.linker);

      // 6. Execute if --run
      if (options.run && exePath) {
        console.log(chalk.green('\nExecutando...'));
        console.log(chalk.gray('---'));
        try {
          const output = execSync(`"${exePath}"`, {
            encoding: 'utf-8',
            cwd: dir,
          });
          if (output) console.log(output);
        } catch (runErr) {
          if (runErr.stdout) console.log(runErr.stdout);
          if (runErr.stderr) console.error(chalk.red(runErr.stderr));
          const code = runErr.status != null ? runErr.status : 1;
          console.error(chalk.red(`Processo encerrou com código ${code}`));
          process.exit(code);
        }
        console.log(chalk.gray('---'));
        console.log(chalk.green('Execução concluída.'));
      }
    } catch (err) {
      console.error(chalk.red(`Erro: ${err.message}`));
      if (err.loc) {
        console.error(chalk.red(`  em linha ${err.loc.line}, coluna ${err.loc.column}`));
      }
      process.exit(1);
    }
  });

program.parse();
