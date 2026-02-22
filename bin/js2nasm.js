#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const { transpile, transpileProject } = require('../src/index.js');

// ---------------------------------------------------------------------------
// Helpers para descoberta de ferramentas
// ---------------------------------------------------------------------------

/**
 * Tenta encontrar o NASM checando o PATH primeiro, depois locais comuns.
 * Retorna o caminho completo para nasm.exe ou null se não encontrado.
 */
function findNasm() {
  // 1. Checa se nasm está disponível no PATH
  try {
    const out = execSync('where nasm', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (out) {
      const first = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) return first;
    }
  } catch (_) { /* não está no PATH */ }

  // 2. Checa local de instalação comum
  const common = 'C:\\Program Files\\NASM\\nasm.exe';
  if (fs.existsSync(common)) return common;

  return null;
}

/**
 * Tenta encontrar o GoLink checando o PATH primeiro, depois o diretório tools/ do projeto.
 * Retorna o caminho completo para GoLink.exe ou null se não encontrado.
 */
function findGoLink() {
  // 1. Checa se golink está disponível no PATH
  try {
    const out = execSync('where golink', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (out) {
      const first = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) return first;
    }
  } catch (_) { /* não está no PATH */ }

  // 2. Checa diretório de ferramentas local do projeto (relativo ao bin/ deste script)
  const projectRoot = path.resolve(__dirname, '..');
  const local = path.join(projectRoot, 'tools', 'golink', 'GoLink.exe');
  if (fs.existsSync(local)) return local;

  return null;
}

// ---------------------------------------------------------------------------
// Helper de compilação (assemblar + linkar)
// ---------------------------------------------------------------------------

/**
 * Assembla com NASM e linka com GoLink (ou MSVC link).
 * Retorna o caminho do .exe resultante, ou null em caso de falha.
 */
function compileOnly(asmPath, linker) {
  const baseName = path.basename(asmPath, '.asm');
  const dir = path.dirname(asmPath);
  const objPath = path.join(dir, `${baseName}.obj`);
  const exePath = path.join(dir, `${baseName}.exe`);

  // --- localiza NASM ---
  const nasmPath = findNasm();
  if (!nasmPath) {
    console.warn(chalk.yellow('Aviso: NASM não encontrado. Pulando compilação.'));
    console.warn(chalk.yellow('  Instale NASM e coloque-o no PATH, ou instale em C:\\Program Files\\NASM'));
    return null;
  }

  // --- localiza linker ---
  let linkerPath = null;
  if (linker === 'golink') {
    linkerPath = findGoLink();
    if (!linkerPath) {
      console.warn(chalk.yellow('Aviso: GoLink não encontrado. Pulando linkagem.'));
      console.warn(chalk.yellow('  Coloque GoLink.exe no PATH ou em tools/golink/ dentro do projeto.'));
      return null;
    }
  }
  // Para MSVC dependemos de 'link' estar no PATH (prompt de dev do Visual Studio).

  try {
    // 1. Assembla
    console.log(chalk.blue(`[1/2] Assemblando com NASM...`));
    execSync(`"${nasmPath}" -f win64 "${asmPath}" -o "${objPath}"`, {
      stdio: 'inherit',
      cwd: dir,
    });
    console.log(chalk.green(`      Objeto gerado: ${objPath}`));

    // 2. Linka
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

    // 3. Limpa .obj
    try {
      fs.unlinkSync(objPath);
    } catch (_) { /* ignora erros de limpeza */ }

    return exePath;
  } catch (err) {
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(chalk.red(err.stderr));
    console.error(chalk.red(`Falha na compilação: ${err.message}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Definição do CLI
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
      // 1. Lê arquivo JS
      const inputPath = path.resolve(input);
      if (!fs.existsSync(inputPath)) {
        console.error(chalk.red(`Erro: arquivo não encontrado: ${inputPath}`));
        process.exit(1);
      }

      const baseName = path.basename(inputPath, '.js');
      const dir = path.dirname(inputPath);

      console.log(chalk.blue(`Transpilando ${path.basename(inputPath)}...`));

      // 2. Transpila (com suporte multi-arquivo)
      const result = transpileProject(inputPath, {
        emitAst: options.emitAst,
        emitIr: options.emitIr,
      });

      // 3. Trata modos de debug
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

      // 4. Salva .asm
      const asmPath = options.output
        ? path.resolve(options.output)
        : path.join(dir, `${baseName}.asm`);

      fs.writeFileSync(asmPath, result.asm, 'utf-8');
      console.log(chalk.green(`Arquivo NASM gerado: ${asmPath}`));

      // 5. Auto-compila (a menos que --no-compile)
      if (options.compile === false) {
        // --no-compile foi passado; para aqui
        return;
      }

      const exePath = compileOnly(asmPath, options.linker);

      // 6. Executa se --run
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
