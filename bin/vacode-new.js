#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import process from "node:process";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const configPath = join(homedir(), ".config", "vacode", "create-app.json");
const defaultProjectsRoot = join(homedir(), "VacodeProjects");
const createVacodeAppPath = fileURLToPath(new URL("./create-vacode-app.js", import.meta.url));
const vacodeNewPath = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const result = {
    help: false,
    installShortcut: false,
    name: undefined,
    open: true,
    root: undefined,
    saveRoot: undefined,
    version: false,
    yes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      result.version = true;
      continue;
    }

    if (arg === "--install-shortcut") {
      result.installShortcut = true;
      continue;
    }

    if (arg === "--name") {
      result.name = readOptionValue(argv, (index += 1), "--name");
      continue;
    }

    if (arg === "--root") {
      result.root = readOptionValue(argv, (index += 1), "--root");
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      result.yes = true;
      continue;
    }

    if (arg === "--no-open") {
      result.open = false;
      continue;
    }

    if (arg === "--save-root") {
      result.saveRoot = true;
      continue;
    }

    if (arg === "--no-save-root") {
      result.saveRoot = false;
      continue;
    }

    if (!arg.startsWith("-") && !result.name) {
      result.name = arg;
      continue;
    }

    throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }

  return result;
}

function readOptionValue(args, index, optionName) {
  const value = args[index];

  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} 값이 필요합니다.`);
  }

  return value;
}

function printHelp() {
  console.log(`vacode-new ${packageJson.version}

새 vacode 웹 상품 프로젝트를 생성하고 VS Code로 엽니다.

처음 한 번:
  gh auth login
  gh auth setup-git
  npm i -g create-vacode-app
  vacode-new --install-shortcut

사용법:
  vacode-new
  vacode-new customer-tool
  vacode-new --name customer-tool --root ~/VacodeProjects --yes

옵션:
  --install-shortcut  Desktop에 Vacode New.command를 생성
  --name <name>       프로젝트 이름
  --root <path>       프로젝트를 저장할 폴더
  --yes, -y           확인 질문 없이 진행
  --no-open           생성 후 VS Code를 열지 않음
  --save-root         root를 기본 저장 폴더로 저장
  --no-save-root      root를 기본 저장 폴더로 저장하지 않음
  -v, --version       CLI 버전 출력
  -h, --help          도움말 출력
`);
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function expandPath(path) {
  if (!path || path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (isAbsolute(path)) return path;
  return resolve(process.cwd(), path);
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function validateProjectName(name) {
  if (!name) return "프로젝트 이름이 필요합니다.";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return "프로젝트 이름은 소문자, 숫자, 하이픈만 사용할 수 있습니다. 예: customer-tool";
  }
  if (name.includes("--")) return "프로젝트 이름에는 연속 하이픈을 쓰지 않습니다.";
  return undefined;
}

async function promptText(rl, label, defaultValue) {
  const suffix = defaultValue ? ` (기본값: ${defaultValue}, Enter로 사용)` : "";
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || defaultValue || "";
}

async function promptYesNo(rl, label, defaultValue = true) {
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${label} ${suffix} `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 실패`);
  }
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    shell: false,
    stdio: "ignore",
  });
  return result.status === 0;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function latestPackageVersion() {
  const result = spawnSync("npm", ["view", "create-vacode-app", "version", "--silent"], {
    encoding: "utf8",
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2500,
  });

  if (result.status !== 0) return undefined;

  const version = result.stdout.trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ? version : undefined;
}

async function maybeUpdateCli({ args, rl }) {
  if (process.env.VACODE_NEW_SKIP_UPDATE === "1") return;

  const latestVersion = latestPackageVersion();
  if (!latestVersion || compareVersions(latestVersion, packageJson.version) <= 0) return;

  console.log(`[vacode-new] 새 버전이 있습니다: ${latestVersion} (현재 ${packageJson.version})`);

  if (args.yes || !rl) {
    printManualUpdateCommand();
    return;
  }

  const shouldUpdate = await promptYesNo(rl, "지금 업데이트할까요?");
  if (!shouldUpdate) return;

  const updateResult = spawnSync("npm", ["i", "-g", "create-vacode-app@latest"], {
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (updateResult.status !== 0) {
    console.warn("[vacode-new] 업데이트에 실패했습니다. 현재 버전으로 계속 진행합니다.");
    printManualUpdateCommand();
    return;
  }

  console.log("\n[vacode-new] 업데이트 완료. 새 버전으로 다시 실행합니다.\n");

  const restartResult = spawnSync(process.execPath, [vacodeNewPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, VACODE_NEW_SKIP_UPDATE: "1" },
    shell: false,
    stdio: "inherit",
  });

  process.exit(restartResult.status ?? 1);
}

function printManualUpdateCommand() {
  console.log(["업데이트하려면 실행하세요:", "  npm i -g create-vacode-app@latest", ""].join("\n"));
}

function setupLooksComplete(projectPath) {
  return exists(join(projectPath, ".env")) && exists(join(projectPath, "node_modules"));
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function installShortcut() {
  if (process.platform !== "darwin") {
    throw new Error("--install-shortcut은 macOS Desktop .command 파일 생성용입니다.");
  }

  const desktopDir = join(homedir(), "Desktop");
  const shortcutPath = join(desktopDir, "Vacode New.command");
  const commandContent = `#!/bin/zsh
NODE_BIN=${shellQuote(process.execPath)}
VACODE_NEW_JS=${shellQuote(vacodeNewPath)}
STATUS=0

if [ -x "$NODE_BIN" ]; then
  "$NODE_BIN" "$VACODE_NEW_JS" || STATUS=$?
elif command -v node >/dev/null 2>&1; then
  node "$VACODE_NEW_JS" || STATUS=$?
else
  echo "Node.js를 찾지 못했습니다."
  echo "먼저 Node.js를 설치한 뒤 다시 실행하세요."
  STATUS=1
fi

echo
if [ "$STATUS" -eq 0 ]; then
  echo "완료되었습니다."
else
  echo "오류가 발생했습니다. 위 메시지를 확인하세요."
fi
echo "종료하려면 Enter를 누르세요."
read
exit "$STATUS"
`;

  mkdirSync(desktopDir, { recursive: true });
  writeFileSync(shortcutPath, commandContent);
  chmodSync(shortcutPath, 0o755);

  console.log(`[vacode-new] 바로가기 생성: ${shortcutPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(packageJson.version);
    return;
  }

  if (args.installShortcut) {
    installShortcut();
    return;
  }

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const config = readConfig();
  const rl = isInteractive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined;

  try {
    await maybeUpdateCli({ args, rl });

    let projectName = args.name;
    while (!projectName && rl) {
      projectName = await promptText(rl, "프로젝트 이름");
      const error = validateProjectName(projectName);
      if (!error) break;
      console.error(error);
      projectName = undefined;
    }

    const nameError = validateProjectName(projectName);
    if (nameError) throw new Error(nameError);

    const savedRoot = typeof config.projectsRoot === "string" ? config.projectsRoot : undefined;
    const defaultRoot = savedRoot ?? defaultProjectsRoot;
    let projectsRoot = args.root ? expandPath(args.root) : undefined;

    if (!projectsRoot && rl) {
      projectsRoot = expandPath(await promptText(rl, "프로젝트 저장 폴더", defaultRoot));
    }

    if (!projectsRoot) {
      projectsRoot = expandPath(defaultRoot);
    }

    const shouldSaveRoot = args.saveRoot ?? true;

    while (true) {
      if (exists(projectsRoot) && !isDirectory(projectsRoot)) {
        throw new Error(`저장 경로가 폴더가 아닙니다: ${projectsRoot}`);
      }

      if (exists(projectsRoot)) {
        break;
      }

      const shouldCreateRoot =
        args.yes || !rl || (await promptYesNo(rl, `저장 폴더가 없습니다: ${projectsRoot}\n만들까요?`));

      if (shouldCreateRoot) {
        mkdirSync(projectsRoot, { recursive: true });
        break;
      }

      if (!rl) {
        throw new Error("저장 폴더가 없어 중단합니다.");
      }

      projectsRoot = expandPath(await promptText(rl, "프로젝트 저장 폴더", defaultRoot));
    }

    const projectPath = join(projectsRoot, projectName);
    if (exists(projectPath)) {
      throw new Error(`이미 같은 이름의 폴더가 있습니다: ${projectPath}`);
    }

    console.log("\n생성 경로:");
    console.log(`  ${projectPath}`);

    if (!args.yes && rl) {
      const confirmed = await promptYesNo(rl, "계속할까요?");
      if (!confirmed) throw new Error("사용자가 취소했습니다.");
    }

    if (shouldSaveRoot) {
      writeConfig({ ...config, projectsRoot });
      if (projectsRoot !== savedRoot) {
        console.log(`[vacode-new] 기본 저장 폴더 저장: ${projectsRoot}`);
      }
    }

    console.log("\n[vacode-new] 템플릿 프로젝트 생성");
    run(process.execPath, [createVacodeAppPath, projectName], projectsRoot);

    if (!exists(projectPath)) {
      throw new Error(`프로젝트 폴더를 찾지 못했습니다: ${projectPath}`);
    }

    const setupPath = join(projectPath, "setup");
    if (exists(setupPath) && !setupLooksComplete(projectPath)) {
      console.log("\n[vacode-new] setup 보강 실행");
      run(setupPath, [], projectPath);
    }

    if (args.open) {
      if (!commandExists("code")) {
        console.warn("[vacode-new] code 명령을 찾지 못했습니다. VS Code를 열지 않습니다.");
      } else {
        console.log("\n[vacode-new] VS Code 열기");
        run("code", [projectPath], process.cwd());
      }
    }

    console.log(`\n[vacode-new] 완료: ${projectPath}`);
  } finally {
    rl?.close();
  }
}

main().catch((error) => {
  console.error(`\n[vacode-new] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
