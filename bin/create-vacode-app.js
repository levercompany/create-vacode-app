#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import readline from "node:readline/promises";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const defaultTemplateRepo =
  process.env.VACODE_WEB_TEMPLATE_REPO ?? "git@github.com:levercompany/vacode-web-template.git";
const defaultTemplateHttpsRepo = "https://github.com/levercompany/vacode-web-template.git";
const defaultTemplateRef = process.env.VACODE_WEB_TEMPLATE_REF ?? "main";

const root = process.cwd();

main().catch((error) => {
  console.error(`\n[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(packageJson.version);
    return;
  }

  await ensureCommand("git", "Git이 필요합니다. GitHub Desktop 또는 Git을 설치한 뒤 다시 실행하세요.");

  const productName = await resolveProductName(options);
  const targetDir = resolve(root, productName);

  await ensureTargetDirectory(targetDir);

  const templateRepo = options.template ?? defaultTemplateRepo;
  const templateRef = options.ref ?? defaultTemplateRef;

  step("vacode 웹 템플릿 가져오기");
  await cloneTemplate({ ref: templateRef, repo: templateRepo, targetDir });
  await removeTemplateGitHistory(targetDir);

  step("상품 프로젝트 초기화");
  await updatePackageName(targetDir, toPackageName(productName));
  await writeTemplateMetadata(targetDir, {
    cli: {
      name: packageJson.name,
      version: packageJson.version,
    },
    createdAt: new Date().toISOString(),
    template: {
      ref: templateRef,
      repository: templateRepo,
    },
  });
  await initProductGit(targetDir);

  if (!options.noSetup) {
    step("초기 세팅 실행");
    await runSetup(targetDir);
  }

  printDone({ noSetup: options.noSetup, productName, targetDir });
}

function parseArgs(args) {
  const options = {
    help: false,
    noSetup: false,
    ref: undefined,
    template: undefined,
    version: false,
    yes: false,
    positional: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--no-setup":
        options.noSetup = true;
        break;
      case "--ref":
        options.ref = readOptionValue(args, (index += 1), "--ref");
        break;
      case "--template":
        options.template = readOptionValue(args, (index += 1), "--template");
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`알 수 없는 옵션입니다: ${arg}`);
        }
        options.positional.push(arg);
        break;
    }
  }

  if (options.positional.length > 1) {
    throw new Error("상품 폴더 이름은 하나만 입력하세요.");
  }

  return options;
}

function readOptionValue(args, index, optionName) {
  const value = args[index];

  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} 값이 필요합니다.`);
  }

  return value;
}

async function resolveProductName(options) {
  const explicitName = options.positional[0];

  if (explicitName) {
    return validateProductName(explicitName);
  }

  if (options.yes) {
    throw new Error("상품 폴더 이름을 입력하세요. 예: npm create vacode-app@latest customer-tool");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("상품 폴더 이름을 입력하세요: ");
    return validateProductName(answer);
  } finally {
    rl.close();
  }
}

function validateProductName(value) {
  const name = value.trim();

  if (!name) {
    throw new Error("상품 폴더 이름이 비어 있습니다.");
  }

  if (name === "." || name === "..") {
    throw new Error("상품 폴더 이름으로 . 또는 ..은 사용할 수 없습니다.");
  }

  return name;
}

async function ensureTargetDirectory(targetDir) {
  if (!(await exists(targetDir))) {
    return;
  }

  const entries = await readdir(targetDir);

  if (entries.length > 0) {
    throw new Error(`${targetDir} 폴더가 이미 있고 비어 있지 않습니다.`);
  }
}

async function cloneTemplate({ ref, repo, targetDir }) {
  const candidateRepos = await getTemplateRepoCandidates(repo);

  for (const candidateRepo of candidateRepos) {
    const shallowResult = await tryCloneTemplateRef({ ref, repo: candidateRepo, targetDir });

    if (shallowResult.ok) {
      return;
    }

    await rm(targetDir, { force: true, recursive: true });

    const cloneResult = await tryRun("git", ["clone", candidateRepo, targetDir]);

    if (!cloneResult.ok) {
      continue;
    }

    const checkoutResult = await tryRun("git", ["-C", targetDir, "checkout", ref]);

    if (checkoutResult.ok) {
      return;
    }

    await rm(targetDir, { force: true, recursive: true });
  }

  throw new Error(
    [
      "vacode-web-template private repo를 받을 수 없습니다.",
      "GitHub에서 levercompany/vacode-web-template 읽기 권한과 로컬 Git 인증을 확인하세요.",
      "",
      "권장 확인:",
      "  gh auth status",
      "  gh auth setup-git",
      "  git ls-remote git@github.com:levercompany/vacode-web-template.git main",
      "",
      `실행한 repo: ${repo}`,
    ].join("\n"),
  );
}

async function getTemplateRepoCandidates(repo) {
  const candidates = [repo];

  if (repo === defaultTemplateRepo && (await hasGitHubCliAuth())) {
    candidates.push(defaultTemplateHttpsRepo);
  }

  return [...new Set(candidates)];
}

async function hasGitHubCliAuth() {
  const result = await tryRun("gh", ["auth", "status"]);
  return result.ok;
}

async function tryCloneTemplateRef({ ref, repo, targetDir }) {
  return tryRun("git", ["clone", "--depth", "1", "--branch", ref, repo, targetDir]);
}

async function removeTemplateGitHistory(targetDir) {
  await rm(join(targetDir, ".git"), { force: true, recursive: true });
}

async function updatePackageName(targetDir, packageName) {
  const packagePath = join(targetDir, "package.json");
  const content = await readFile(packagePath, "utf8");
  const manifest = JSON.parse(content);
  manifest.name = packageName;
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  ok(`package.json name: ${packageName}`);
}

async function writeTemplateMetadata(targetDir, metadata) {
  const metadataDir = join(targetDir, ".vacode");
  await mkdir(metadataDir, { recursive: true });
  await writeFile(join(metadataDir, "template.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  ok(".vacode/template.json 생성");
}

async function initProductGit(targetDir) {
  const result = await tryRun("git", ["-C", targetDir, "init", "-b", "main"]);

  if (!result.ok) {
    await run("git", ["-C", targetDir, "init"]);
    await run("git", ["-C", targetDir, "branch", "-M", "main"]);
  }

  ok("새 Git 저장소 초기화");
}

async function runSetup(targetDir) {
  const setupPath = join(targetDir, "setup");

  if (!(await exists(setupPath))) {
    throw new Error("템플릿에 setup 파일이 없습니다.");
  }

  await run(setupPath, [], { cwd: targetDir });
}

async function ensureCommand(command, message) {
  const result = await tryRun(command, ["--version"]);

  if (!result.ok) {
    throw new Error(message);
  }
}

function toPackageName(value) {
  const name = basename(value)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return name || "vacode-product";
}

async function run(command, args, options = {}) {
  const child = spawn(commandName(command), args, {
    cwd: options.cwd ?? root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  const code = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} 실패`);
  }
}

async function tryRun(command, args, options = {}) {
  const child = spawn(commandName(command), args, {
    cwd: options.cwd ?? root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "ignore",
  });

  const code = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  return { ok: code === 0 };
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function commandName(command) {
  if (process.platform !== "win32" || isAbsolute(command)) {
    return command;
  }

  return `${command}.cmd`;
}

function step(message) {
  console.log(`\n[create-vacode-app] ${message}`);
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function printDone({ noSetup, productName, targetDir }) {
  console.log(`
[create-vacode-app] 완료
상품 폴더: ${targetDir}

다음 순서:
  cd ${productName}
${noSetup ? "  ./setup\n" : ""}  bun run dev
`);
}

function printHelp() {
  console.log(`
create-vacode-app ${packageJson.version}

사용법:
  npm create vacode-app@latest <상품-폴더>
  bunx create-vacode-app <상품-폴더>

옵션:
  --ref <git-ref>        사용할 vacode-web-template branch/tag/commit (기본: ${defaultTemplateRef})
  --template <git-url>   사용할 템플릿 repo (기본: ${defaultTemplateRepo})
  --no-setup             템플릿 복사 후 ./setup 실행을 건너뜀
  -y, --yes              대화형 질문 없이 실행
  -v, --version          CLI 버전 출력
  -h, --help             도움말 출력

필요 권한:
  levercompany/vacode-web-template 읽기 권한
  levercompany/vacode-design-system 읽기 권한
`);
}
