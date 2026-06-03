# create-vacode-app

`vacode-web-template` private repo에서 새 vacode 웹 상품 프로젝트를 만드는 얇은 초기화 CLI입니다.

이 패키지는 public npm에 올릴 수 있습니다. 회사 비밀 코드, 디자인 시스템 소스, 템플릿 파일은 포함하지 않습니다.
실제 웹 템플릿은 `levercompany/vacode-web-template` private repo에서 가져옵니다.

## 사용법

바이브코더가 처음 쓰는 컴퓨터에서는 아래를 한 번만 실행합니다.

```bash
gh auth login
gh auth setup-git
npm i -g create-vacode-app@latest
vacode-new --install-shortcut
```

`vacode-new --install-shortcut`은 macOS Desktop에 `Vacode New.command`를 만듭니다.
그 다음부터는 `Vacode New.command`를 더블클릭하고 Terminal에 나오는 질문에 프로젝트 이름과 저장 폴더를 입력하면 됩니다.
기본 저장 폴더는 `~/VacodeProjects`이고, 생성이 끝나면 VS Code로 새 프로젝트를 엽니다.
저장 폴더를 바꾸면 그 값을 다음 실행 기본값으로 기억합니다.

터미널에서 바로 만들 때는 아래처럼 실행합니다.

```bash
vacode-new customer-tool
```

`vacode-new`는 내부에서 `create-vacode-app`을 실행합니다.
템플릿 clone, Git 초기화, `package.json` 이름 변경, `.vacode/template.json` 기록, 템플릿의 `./setup` 실행은 `create-vacode-app`이 담당합니다.
새 버전이 있으면 `vacode-new`가 시작할 때 업데이트할지 묻습니다.
업데이트에 동의하면 `npm i -g create-vacode-app@latest`를 실행한 뒤 새 버전으로 다시 시작합니다.
비대화형 실행이나 `--yes` 실행에서는 멈추지 않고 업데이트 명령만 안내합니다.

직접 `create-vacode-app`을 실행해야 할 때는 아래 명령을 씁니다.

```bash
gh auth login
gh auth setup-git
npm create vacode-app@latest customer-tool
cd customer-tool
bun run dev
```

또는:

```bash
bunx create-vacode-app customer-tool
```

CLI는 기본적으로 아래 작업을 합니다.

- `https://github.com/levercompany/vacode-web-template.git`의 최신 SemVer tag를 찾습니다.
- 검증된 최신 tag를 clone합니다.
- 템플릿 Git 기록을 제거하고 새 Git 저장소로 초기화합니다.
- `package.json`의 `name`을 상품 폴더 이름에 맞춥니다.
- `.vacode/template.json`에 사용한 템플릿 repo/ref와 CLI 버전을 기록합니다.
- 템플릿의 `./setup`을 실행합니다.

## 필요 권한

내부 사용자는 GitHub에서 아래 권한이 필요합니다.

- `levercompany/vacode-web-template` 읽기 권한
- `levercompany/vacode-design-system` 읽기 권한
- GitHub CLI 로그인: `gh auth login && gh auth setup-git`

권한이 없으면 템플릿 clone 또는 디자인 시스템 설치 단계에서 실패합니다.
SSH 인증은 GitHub CLI를 쓰지 않는 개발자용 fallback입니다.
GitHub 계정 비밀번호는 입력하지 않습니다.
인증이 없으면 CLI는 username/password 프롬프트를 띄우지 않고 `gh auth login`과 `gh auth setup-git` 안내를 보여줍니다.
macOS Keychain 또는 SSH 키 비밀번호를 묻는 환경도 CLI 안에서는 대기하지 않고 실패합니다. SSH를 쓰려면 키를 등록하거나 `gh auth` 흐름을 먼저 끝내세요.

## 옵션

```bash
npm create vacode-app@latest customer-tool -- --ref v0.1.5
npm create vacode-app@latest customer-tool -- --ref main
npm create vacode-app@latest customer-tool -- --no-setup
npm create vacode-app@latest customer-tool -- --template git@github.com:levercompany/vacode-web-template.git
```

환경 변수로 기본값을 바꿀 수 있습니다.

```bash
VACODE_WEB_TEMPLATE_REPO=https://github.com/levercompany/vacode-web-template.git
VACODE_WEB_TEMPLATE_REF=v0.1.5
```

기본값은 `main`이 아닙니다.
`vacode-web-template`의 최신 `vX.Y.Z` tag를 자동으로 사용합니다.
템플릿 `main`에 새 변경이 push되어도 tag를 찍기 전까지 새 상품 생성에는 반영되지 않습니다.

## 보안 기준

- 이 CLI에 token, SSH key, Supabase key, Vercel token을 넣지 않습니다.
- private repo URL은 노출될 수 있지만, 실제 코드는 GitHub 권한이 있어야 받을 수 있습니다.
- 템플릿과 디자인 시스템 업데이트는 각 private repo에서 관리합니다.

## 릴리즈

`create-vacode-app`은 GitHub Actions와 npm Trusted Publishing으로 배포합니다.
릴리즈용 npm token을 저장하지 않습니다.

처음 한 번 npm package 설정에서 Trusted Publisher를 연결합니다.
`--allow-publish`를 지원하는 최신 npm이 필요합니다.

```bash
npm install -g npm@latest
npm trust github create-vacode-app --repo levercompany/create-vacode-app --file publish.yml --allow-publish -y
npm trust list create-vacode-app
```

권한 오류가 나면 npm package settings에서 직접 연결합니다.

- Provider: GitHub Actions
- Organization or user: `levercompany`
- Repository: `create-vacode-app`
- Workflow filename: `publish.yml`
- Allowed actions: `npm publish`
- Environment name: 비움

릴리즈할 때는 버전을 올리고 tag를 push합니다.

```bash
npm run verify
npm version patch
git push origin main --follow-tags
```

`vX.Y.Z` tag가 push되면 `.github/workflows/publish.yml`이 실행되고 npm에 publish합니다.
workflow는 tag와 `package.json` version이 다르면 실패합니다.

로컬에서 `npm publish`는 긴급 상황에서만 사용합니다.
