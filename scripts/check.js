// Checks this project's Git repository and prints a report.
// Run it from the project folder with: node scripts/check.js
//
// It only reads: it never changes a file, the index or a commit.
//
// The checks for the move to npm and Vite (package.json, node_modules/, the lockfile,
// dist/, .env and the vite branch) each run only once their file or branch exists.
// The npm check runs every time.
//
// The checks for GitHub run once the repository has a remote called origin. They read
// your public repository on GitHub without logging in (its main branch, issues and pull
// requests), so they need an internet connection. Everything else works offline. Before
// the first push, an empty repository on GitHub is expected: its issues are still checked.
//
// From course 4 on, every change goes through a pull request. The checks for Prettier
// and ESLint run once .prettierrc and eslint.config.js exist.
//
// From course 5 on, a merge into main deploys the site. The checks for deploying run once
// .github/workflows/deploy.yml exists: Vite's base, the last deploy run, main's protection
// and the live site.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const results = [];

function git(...args) {
  const run = spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
  return {
    ok: run.status === 0,
    out: (run.stdout ?? "").trimEnd(),
    missing: run.error?.code === "ENOENT",
  };
}

function pass(text) {
  results.push({ mark: "✔", text });
}

function fail(text, next) {
  results.push({ mark: "✘", text, next });
}

function warn(text, next) {
  results.push({ mark: "!", text, next });
}

function report() {
  console.log(`Checking the Git repository in ${projectDir}\n`);
  for (const { mark, text, next } of results) {
    console.log(`${mark} ${text}`);
    if (next) {
      console.log(`  Next step: ${next}`);
    }
  }
  const failed = results.filter((result) => result.mark === "✘").length;
  const warned = results.filter((result) => result.mark === "!").length;
  console.log(
    failed === 0
      ? `\nAll checks passed${warned ? `, with ${warned} thing(s) worth a look` : ""}.`
      : `\n${failed} check(s) failed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

function checkGitInstalled() {
  const version = git("--version");
  if (version.missing || !version.ok) {
    fail(
      "Git isn't installed, or your terminal can't find it.",
      "install Git, then open a new terminal.",
    );
    return false;
  }
  pass(`Git is installed (${version.out}).`);
  return true;
}

function checkRepository() {
  const top = git("rev-parse", "--show-toplevel");
  if (!top.ok) {
    fail("This folder isn't a Git repository yet.", "run git init in the project folder.");
    return false;
  }
  if (realpathSync(top.out) !== projectDir) {
    fail(
      `The repository starts at ${top.out}, above this project, so Git treats everything in that folder as one project.`,
      `remove the .git folder in ${top.out} if you made it by accident, then run git init in the project folder.`,
    );
    return false;
  }
  pass("The project folder is a Git repository.");
  return true;
}

function checkIdentity() {
  const name = git("config", "user.name").out;
  const email = git("config", "user.email").out;
  if (!name || !email) {
    fail(
      "Git doesn't know your name and email yet, so it can't label your commits.",
      'git config --global user.name "Your Name" and git config --global user.email you@example.com',
    );
    return;
  }
  pass(`Your commits are labeled ${name} <${email}>.`);
}

function checkIgnored() {
  if (!existsSync(join(projectDir, ".gitignore"))) {
    fail("There's no .gitignore file.", "add a .gitignore that lists notes.txt and .DS_Store.");
    return;
  }
  for (const file of ["notes.txt", ".DS_Store"]) {
    if (git("check-ignore", "-q", "--no-index", file).ok) {
      pass(`.gitignore keeps ${file} out of the repository.`);
    } else {
      fail(`.gitignore doesn't list ${file}.`, `add a line with ${file} to .gitignore.`);
    }
  }
  for (const file of ["notes.txt", ".DS_Store"]) {
    if (git("ls-files", "--error-unmatch", file).ok) {
      fail(
        `${file} is tracked: it's in the index or a commit, and .gitignore doesn't change that.`,
        `git rm --cached ${file}, then commit. The file stays on your disk.`,
      );
    }
  }
}

function checkCommits() {
  const count = git("rev-list", "--count", "HEAD");
  if (!count.ok) {
    fail(
      "There are no commits yet.",
      "stage the project's files with git add, then make the first commit.",
    );
    return;
  }
  pass(`The history has ${count.out} commit(s).`);

  const vague = /^(update[sd]?|changes?|fix(es|ed)?|wip|stuff|misc|edit(s|ed)?|\.+)$/i;
  // Git writes merge commits' subjects itself, so only your own commits are checked.
  const subjects = git("log", "--no-merges", "--format=%h %s").out.split("\n");
  for (const line of subjects) {
    const [hash, ...words] = line.split(" ");
    const subject = words.join(" ");
    if (subject.length > 72) {
      warn(
        `Commit ${hash} has a ${subject.length}-character subject line.`,
        "keep the subject short (about 50 characters) and put details in the body.",
      );
    } else if (vague.test(subject.trim())) {
      warn(
        `Commit ${hash} says only "${subject}".`,
        'say what the commit does, like "Add Thanksgiving hours".',
      );
    }
  }
}

function isTracked(path) {
  return git("ls-files", "--error-unmatch", path).ok;
}

function isIgnored(path) {
  return git("check-ignore", "-q", "--no-index", path).ok;
}

// Whether the vite branch's .gitignore has a rule for a file this branch doesn't ignore
// yet: until vite is merged, its rules aren't in this branch's .gitignore.
function ruleOnVite(rule) {
  if (currentBranch() === "vite") {
    return false;
  }
  const gitignore = git("show", "vite:.gitignore");
  return gitignore.ok && gitignore.out.split("\n").some((line) => line.trim() === rule);
}

function currentBranch() {
  const branch = git("symbolic-ref", "--short", "-q", "HEAD");
  return branch.ok ? branch.out : null;
}

function checkBranch() {
  const branch = currentBranch();
  if (branch) {
    pass(`You're on the ${branch} branch.`);
  } else {
    warn(
      "You're not on a branch: HEAD points straight at a commit.",
      "git switch main to get back on a branch.",
    );
  }
}

function readPackageJson() {
  if (!existsSync(join(projectDir, "package.json"))) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
  } catch (error) {
    fail(
      `package.json isn't valid JSON (${error.message}).`,
      "fix the file, so npm and this script can read it.",
    );
    return null;
  }
}

function checkPackageJson(pkg) {
  if (pkg.type === "module") {
    pass('package.json has "type": "module".');
  } else {
    fail(
      pkg.type === undefined
        ? 'package.json has no "type" field.'
        : `package.json has "type": "${pkg.type}".`,
      'set "type": "module" in package.json, because the store\'s code and this script are ES modules.',
    );
  }
  if (pkg.scripts?.check) {
    pass('package.json has a "check" script, so npm run check runs this report.');
  } else {
    fail(
      'package.json has no "check" script.',
      'add "check": "node scripts/check.js" to its "scripts".',
    );
  }
}

function checkNodeModules() {
  if (isIgnored("node_modules/")) {
    pass(".gitignore keeps node_modules/ out of the repository.");
  } else {
    fail(".gitignore doesn't list node_modules/.", "add a line with node_modules/ to .gitignore.");
  }
  const tracked = git("ls-files", "node_modules").out;
  if (tracked) {
    fail(
      `${tracked.split("\n").length} file(s) in node_modules/ are tracked.`,
      "git rm -r --cached node_modules, then commit. The packages stay on your disk.",
    );
  }
}

function checkLockfile(pkg) {
  const count = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length;
  if (count === 0) {
    return;
  }
  if (isTracked("package-lock.json")) {
    pass("package-lock.json is tracked, so every copy installs the same package versions.");
  } else if (existsSync(join(projectDir, "package-lock.json"))) {
    fail(
      `package.json lists ${count} package(s), but package-lock.json isn't tracked.`,
      "commit it with package.json: git add package.json package-lock.json, then git commit.",
    );
  } else {
    fail(
      `package.json lists ${count} package(s), but there's no package-lock.json.`,
      "run npm install to create it, then commit it with package.json.",
    );
  }
}

function checkDist() {
  if (isIgnored("dist/")) {
    pass(".gitignore keeps dist/, the build output, out of the repository.");
  } else {
    warn(
      ".gitignore doesn't list dist/, the build output.",
      ruleOnVite("dist/")
        ? "the dist/ rule is committed on the vite branch, so leave dist/ out of your commits here until vite is merged."
        : "add a line with dist/ to .gitignore. npm run build makes the folder again whenever you need it.",
    );
  }
  const tracked = git("ls-files", "dist").out;
  if (tracked) {
    fail(
      `${tracked.split("\n").length} file(s) in dist/ are tracked.`,
      "git rm -r --cached dist, then commit. The build output stays on your disk.",
    );
  }
}

// A Generic Curbside key: its prefix followed by a key-like value, at least eight
// letters, digits or underscores. "curb_sec_..." and a bare prefix don't count.
const curbKey = "curb_(pub|sec)_[A-Za-z0-9_]{8,}";
const curbSecretKey = "curb_sec_[A-Za-z0-9_]{8,}";

function checkEnv() {
  const ignored = isIgnored(".env");
  const tracked = isTracked(".env");
  if (!ignored && !tracked) {
    fail(
      ".env isn't ignored, so git add . would commit the key in it.",
      ruleOnVite(".env")
        ? "the .env rule is committed on the vite branch, so stage files by name here and leave .env out until vite is merged."
        : "add a line with .env to .gitignore before you stage anything.",
    );
  }
  if (tracked) {
    fail(
      ".env is tracked: the key in it is in the index or a commit, and .gitignore doesn't change that.",
      `rotate the key in Generic Curbside's admin first, then git rm --cached .env${ignored ? "" : ", add .env to .gitignore,"} and commit. The file stays on your disk.`,
    );
  }
  if (!ignored) {
    return;
  }
  if (!tracked) {
    pass(".gitignore keeps .env out of the repository.");
  }

  if (!existsSync(join(projectDir, ".env.example"))) {
    fail(
      "There's no .env.example to show which values .env needs.",
      "create .env.example with the same names as .env and placeholder values, then commit it.",
    );
  } else if (new RegExp(curbKey).test(readFileSync(join(projectDir, ".env.example"), "utf8"))) {
    fail(
      ".env.example holds a Generic Curbside key, not a placeholder.",
      "replace the key with a placeholder, such as your-publishable-key. If it's a secret key, rotate it first.",
    );
  } else if (!isTracked(".env.example")) {
    fail(
      ".env.example isn't committed yet.",
      "git add .env.example, read git diff --staged, then commit it.",
    );
  } else {
    pass(".env.example is committed, with a placeholder instead of the key.");
  }
}

function checkSecrets() {
  const found = git("grep", "-I", "-l", "-E", curbSecretKey);
  if (found.ok && found.out) {
    fail(
      `A Generic Curbside secret key is in a tracked file: ${found.out.split("\n").join(", ")}.`,
      "rotate the secret key in Generic Curbside's admin first, then take it out of the file and commit. Older commits still hold it.",
    );
  } else {
    pass("No tracked file holds a Generic Curbside secret key (curb_sec_...).");
  }
}

function checkViteMerged() {
  if (currentBranch() !== "main" || !git("rev-parse", "--verify", "-q", "refs/heads/vite").ok) {
    return;
  }
  if (git("merge-base", "--is-ancestor", "vite", "main").ok) {
    pass("Everything on the vite branch is in main.");
  } else {
    warn(
      "The vite branch isn't merged into main yet.",
      "finish the move on vite, then git switch main and git merge vite.",
    );
  }
}

// npm 12 and later run a package's install scripts only after you approve them, and the
// course is written for that. Node can come with an older npm, which updates in one step.
function checkNpm() {
  // Under npm run, npm_execpath is the npm that runs this script; otherwise ask npm -v.
  let major = null;
  const execPath = process.env.npm_execpath ?? "";
  if (/npm-cli\.js$/.test(execPath)) {
    const npmPackage = join(dirname(execPath), "..", "package.json");
    if (existsSync(npmPackage)) {
      major = Number(JSON.parse(readFileSync(npmPackage, "utf8")).version.split(".")[0]);
    }
  }
  if (major === null) {
    const run = spawnSync("npm", ["-v"], { encoding: "utf8", shell: process.platform === "win32" });
    if (run.status !== 0 || !run.stdout) {
      warn(
        "npm doesn't run in this terminal.",
        "install Node.js, which comes with npm, then open a new terminal.",
      );
      return;
    }
    major = Number(run.stdout.trim().split(".")[0]);
  }
  if (major >= 12) {
    pass("npm is version 12 or later.");
  } else {
    warn(
      `npm is version ${major}, older than this course expects.`,
      "update it once with npm install -g npm@latest, then check with npm -v.",
    );
  }
}

function checkMoveToVite() {
  checkNpm();
  checkBranch();
  const pkg = readPackageJson();
  if (pkg) {
    checkPackageJson(pkg);
  }
  if (pkg || existsSync(join(projectDir, "node_modules"))) {
    checkNodeModules();
  }
  if (pkg) {
    checkLockfile(pkg);
  }
  if (existsSync(join(projectDir, "dist"))) {
    checkDist();
  }
  if (existsSync(join(projectDir, ".env"))) {
    checkEnv();
  }
  checkSecrets();
  checkViteMerged();
}

function checkClean() {
  const status = git("status", "--porcelain");
  if (status.out) {
    const lines = status.out.split("\n");
    const files = lines.map((line) => line.slice(3));
    const keepOut = files.filter(
      (file) => file === ".env" || file === "dist/" || file.startsWith("dist/"),
    );
    // git restore only works on files Git already tracks. On an untracked file it fails
    // with a pathspec error, so new files get their own advice.
    const untracked = lines.filter((line) => line.startsWith("??")).map((line) => line.slice(3));
    const trackedLines = lines.filter((line) => !line.startsWith("??"));
    const tracked = trackedLines.map((line) => line.slice(3));
    // A plain git restore only resets the working tree, so staged changes need --staged too.
    const restore = trackedLines.some((line) => line[0] !== " ")
      ? "git restore --staged --worktree"
      : "git restore";
    const one = untracked.length === 1;
    const advice = [];
    if (tracked.length) {
      advice.push(
        untracked.length
          ? `commit the changes to ${tracked.join(", ")}, or throw them away with ${restore} ${tracked.join(" ")} if you don't want them.`
          : `commit the changes, or throw them away with ${restore} ${tracked.join(" ")} if you don't want them.`,
      );
    }
    if (untracked.length) {
      const it = one ? "it" : "them";
      advice.push(
        `${untracked.join(", ")} ${one ? "is" : "are"} new to Git (git status lists ${it} under "Untracked files"): ` +
          `commit ${it}, or delete ${it} if you don't want ${it}.`,
      );
    }
    warn(
      `Not everything is committed yet: ${files.join(", ")}.`,
      keepOut.length
        ? `stage your changes by file name, not with git add ., and leave ${keepOut.join(" and ")} out of the commit.`
        : advice.join(" "),
    );
  } else {
    pass("Everything is committed.");
  }
}

// --- Prettier, ESLint and branches (course 4 on) ---------------------------------------

// npm and npx, which are npm.cmd and npx.cmd on Windows, so they need a shell there.
function npm(command, args) {
  return spawnSync(command, args, {
    cwd: projectDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

// Whether a package listed in package.json is installed in this copy's node_modules/.
// A fresh clone has none until npm ci.
function installed(name) {
  if (existsSync(join(projectDir, "node_modules", name, "package.json"))) {
    return true;
  }
  fail(
    `${name} is in package.json, but not installed in this copy.`,
    "npm ci, which installs exactly what package-lock.json lists.",
  );
  return false;
}

function checkPrettier(pkg) {
  if (!existsSync(join(projectDir, ".prettierrc"))) {
    return;
  }
  const version = pkg?.devDependencies?.prettier;
  if (!version) {
    fail(
      "There's a .prettierrc, but prettier isn't in package.json's devDependencies.",
      "npm install -D --save-exact prettier",
    );
    return;
  }
  if (!/^\d/.test(version)) {
    warn(
      `prettier is listed as "${version}", a range, so two computers can format differently.`,
      "npm install -D --save-exact prettier, so package.json lists one exact version.",
    );
  } else {
    pass(`prettier ${version} is pinned to one exact version.`);
  }
  if (!installed("prettier")) {
    return;
  }
  const run = npm("npx", ["--no-install", "prettier", "--check", "."]);
  if (run.status === 0) {
    pass("prettier --check . finds every file formatted.");
  } else {
    const output = (run.stdout + run.stderr).split("\n");
    // A file Prettier can't read at all is a syntax error, which formatting can't fix.
    const unreadable = output
      .filter((line) => line.startsWith("[error] ") && /: SyntaxError/.test(line))
      .map((line) => line.slice(8).split(":")[0]);
    if (unreadable.length) {
      fail(
        `Prettier can't read ${unreadable.join(", ")}: there's a syntax error.`,
        "npm run build or npm run lint shows the line it's on. Fix it there, then run the check again.",
      );
      return;
    }
    const files = output
      .filter((line) => line.startsWith("[warn] ") && !line.includes("Code style issues"))
      .map((line) => line.slice(7));
    fail(
      files.length
        ? `prettier --check . finds files that aren't formatted: ${files.join(", ")}.`
        : "prettier --check . didn't pass.",
      "npm run format, then look at git diff and commit the result.",
    );
  }
}

function checkLint(pkg) {
  if (!existsSync(join(projectDir, "eslint.config.js"))) {
    return;
  }
  if (!pkg?.scripts?.lint) {
    fail(
      'There\'s an eslint.config.js, but package.json has no "lint" script.',
      'add "lint": "eslint ." to its "scripts".',
    );
    return;
  }
  if (!installed("eslint")) {
    return;
  }
  const run = npm("npm", ["run", "lint", "--silent"]);
  if (run.status === 0) {
    pass("npm run lint finds no problems.");
  } else {
    const count = /(\d+) problems?/.exec(run.stdout + run.stderr);
    fail(
      count ? `npm run lint finds ${count[1]} problem(s).` : "npm run lint didn't pass.",
      "run npm run lint, and fix each problem at the file, line and rule it names.",
    );
  }
}

// After a squash merge, GitHub deletes the pull request's branch, and the local branch
// stays behind. Its upstream is compared with GitHub's branches, so no fetch is needed.
async function checkGoneBranches(repository) {
  const upstreams = git("for-each-ref", "--format=%(refname:short) %(upstream:short)", "refs/heads")
    .out.split("\n")
    .map((line) => line.split(" "))
    .filter(([branch, upstream]) => branch !== "main" && upstream?.startsWith("origin/"));
  if (!upstreams.length) {
    return;
  }
  const branches = await gitHub(`/repos/${repository}/branches?per_page=100`);
  if (!Array.isArray(branches.body)) {
    gitHubSkipped(branches, "the checks for branches deleted on GitHub");
    return;
  }
  const onGitHub = new Set(branches.body.map((branch) => branch.name));
  // GitHub's answer can be a minute old, so a branch pushed in the last two minutes may
  // not be in it yet. Git's reflog for origin/<branch> says when it was last pushed or
  // fetched.
  const recent = (upstream) => {
    const when = Number(git("log", "-g", "-1", "--format=%ct", `refs/remotes/${upstream}`).out);
    return when && Date.now() / 1000 - when < 120;
  };
  const gone = upstreams
    .filter(([, upstream]) => !onGitHub.has(upstream.slice("origin/".length)) && !recent(upstream))
    .map(([branch]) => branch);
  if (gone.length) {
    warn(
      `${gone.join(", ")} ${gone.length === 1 ? "is" : "are"} deleted on GitHub, but still here.`,
      `if ${gone.length === 1 ? "its pull request is" : "their pull requests are"} merged, git branch -D ${gone.join(" ")}. A squash merge makes a new commit, so Git doesn't count the branch as merged into main.`,
    );
  }
}

// --- Deploying (course 5 on) -----------------------------------------------------------

const deployWorkflow = join(projectDir, ".github", "workflows", "deploy.yml");

// A project site lives at https://<owner>.github.io/<repository>/, so Vite's base has to be
// "/<repository>/", or the live pages look for their files at the site's root.
function checkBase(repository) {
  const name = repository.split("/")[1];
  const config = readFileSync(join(projectDir, "vite.config.js"), "utf8");
  const base = /base:\s*["'`]([^"'`]*)["'`]/.exec(config)?.[1];
  if (base === `/${name}/`) {
    pass(`vite.config.js sets base to "/${name}/", the project site's path.`);
  } else {
    fail(
      base === undefined
        ? "vite.config.js sets no base, so the live site looks for its files at https://<you>.github.io/ instead of the project's folder."
        : `vite.config.js sets base to "${base}", but the project site lives at /${name}/.`,
      `set base: "/${name}/" in vite.config.js, in its own pull request.`,
    );
  }
}

async function checkDeploy(repository) {
  const runs = await gitHub(`/repos/${repository}/actions/runs?branch=main&event=push&per_page=1`);
  if (!Array.isArray(runs.body?.workflow_runs)) {
    gitHubSkipped(runs, "the checks for the deploy run");
  } else if (!runs.body.workflow_runs.length) {
    // Vite's base and the live site only make sense once something has been deployed.
    warn(
      "GitHub Actions has no deploy run on main yet.",
      "merge the pull request that adds .github/workflows/deploy.yml, then watch the Actions tab.",
    );
    return;
  } else {
    const [run] = runs.body.workflow_runs;
    if (run.status !== "completed") {
      warn(
        `The deploy run for main is still ${run.status}.`,
        "wait for it to finish, then run the check again.",
      );
    } else if (run.conclusion === "success") {
      pass(`The last deploy run for main succeeded (${run.head_sha.slice(0, 7)}).`);
    } else {
      fail(
        `The last deploy run for main ended with "${run.conclusion}", so the live site still shows the version before it.`,
        `read the failed step's log at ${run.html_url}, then fix the cause in a pull request.`,
      );
    }
  }

  checkBase(repository);

  const rules = await gitHub(`/repos/${repository}/rules/branches/main`);
  if (!Array.isArray(rules.body)) {
    gitHubSkipped(rules, "the checks for main's protection");
  } else {
    const types = new Set(rules.body.map((rule) => rule.type));
    const checks = rules.body
      .filter((rule) => rule.type === "required_status_checks")
      .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
      .map((check) => check.context);
    if (types.has("pull_request") && checks.includes("check")) {
      pass("main is protected: changes need a pull request with a passing check.");
    } else {
      warn(
        types.size
          ? "main is protected, but not with both a pull request and the check required."
          : "main isn't protected yet, so a push straight to main still goes live.",
        "add a ruleset for main (Settings, Rules, Rulesets) that requires a pull request and the status check named check.",
      );
    }
  }

  // The live site, and whether its stylesheet loads: with a wrong base, the page arrives
  // but its files don't.
  const [owner, name] = repository.split("/");
  const site = `https://${owner.toLowerCase()}.github.io/${name}/`;
  try {
    const page = await fetch(site, { signal: AbortSignal.timeout(10000) });
    const html = page.ok ? await page.text() : "";
    if (!html.includes("Generic Grocery Co.")) {
      fail(
        `${site} doesn't show the store's site (status ${page.status}).`,
        "check the deploy run in the Actions tab, and that Settings, Pages uses GitHub Actions.",
      );
      return;
    }
    const css = /href="([^"]+\.css)"/.exec(html)?.[1];
    const styles = css && (await fetch(new URL(css, site), { signal: AbortSignal.timeout(10000) }));
    if (styles?.ok) {
      pass(`The store's site is live at ${site}, with its styles.`);
    } else {
      fail(
        `${site} is live, but its stylesheet ${css ?? ""} doesn't load, so the page shows without styles.`,
        "check Vite's base in vite.config.js, then look at the addresses in the built dist/index.html.",
      );
    }
  } catch {
    warn(`${site} didn't answer.`, "check your internet connection, then run the check again.");
  }
}

// --- GitHub (course 3 on) -----------------------------------------------------------

// Each course's work arrives as issues with these titles. They're found by title, because
// their numbers depend on what else the repository has. The last group is this course's;
// an earlier course's issues are checked only if the repository has them (a repository
// made from this course's ZIP doesn't).
const issueGroups = [
  [
    "Add next week's deals",
    "Add the deli counter's hours to the departments page",
    "Close at 1 p.m. on Thanksgiving",
    "Open at 8 a.m. on Thanksgiving",
    "Mark bananas down to 49¢ a pound",
  ],
  [
    "Add ESLint and Prettier",
    "Show a closing-soon notice on the home page",
    "Add a Christmas turkey pre-order page",
  ],
  [
    "Put the store's site live",
    "Add the deals for the week of December 16",
    "Add the deals for the week of December 23",
  ],
];
// The pull request whose review the course grades: it must have line comments.
const reviewedPullRequest = "Add a Christmas turkey pre-order page";

// owner/name from a GitHub remote URL (https://github.com/owner/name.git or
// git@github.com:owner/name.git), or null for another host.
function gitHubRepository(url) {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(\.git)?\/?$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

async function gitHub(path) {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: { "User-Agent": "generic-grocery-check", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    // Without a login, GitHub answers 60 requests an hour from one network.
    const limited = response.headers.get("x-ratelimit-remaining") === "0";
    const reset = new Date(Number(response.headers.get("x-ratelimit-reset")) * 1000);
    return {
      status: response.status,
      body: response.ok ? await response.json() : null,
      limited: limited && !response.ok,
      reset,
    };
  } catch {
    return { status: 0, body: null };
  }
}

// The warning for a GitHub request that didn't work: what was skipped, and when to retry.
function gitHubSkipped(answer, what) {
  if (answer.limited) {
    const time = answer.reset.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    warn(
      `GitHub's limit of 60 answers an hour without a login is used up, so ${what} were skipped.`,
      `run the check again after ${time}.`,
    );
  } else {
    warn(
      `GitHub didn't answer (status ${answer.status}), so ${what} were skipped.`,
      "check your internet connection, or wait a few minutes, then run the check again.",
    );
  }
}

function checkRemote() {
  const url = git("remote", "get-url", "origin");
  if (!url.ok) {
    return null;
  }
  const repository = gitHubRepository(url.out);
  if (!repository) {
    warn(
      `origin points at ${url.out}, which isn't on GitHub.`,
      "set origin to your GitHub repository's URL with git remote set-url origin <url>.",
    );
    return null;
  }
  pass(`origin is your GitHub repository, ${repository}.`);
  return repository;
}

// Whether main's only commit that isn't on GitHub yet is this course's setup commit, which
// a learner who keeps their repository makes on main and pushes, like the courses before.
function setupOnly() {
  const subjects = git("log", "--format=%s", "main@{upstream}..main").out.split("\n");
  return (
    subjects.length === 1 &&
    ["Plan the move to pull requests", "Plan automatic deploys"].includes(subjects[0])
  );
}

function checkUpstream() {
  const upstream = git("rev-parse", "--abbrev-ref", "main@{upstream}");
  // A repository made from the ZIP starts with an empty one on GitHub: until the first
  // push, there's no origin/main, and no upstream is what's expected.
  if (!upstream.ok && !git("rev-parse", "--verify", "--quiet", "refs/remotes/origin/main").ok) {
    warn(
      "main isn't on GitHub yet, so it has no upstream branch.",
      "git push -u origin main, once.",
    );
    return false;
  }
  if (!upstream.ok) {
    fail(
      "main has no upstream branch, so git push and git pull don't know where to go.",
      "git push -u origin main, once.",
    );
    return false;
  }
  pass(`main pushes to and pulls from ${upstream.out}.`);
  // A fresh Git stops at the first pull where both sides have new commits until it's told
  // how to combine them. This course merges.
  if (!git("config", "pull.rebase").ok && !git("config", "pull.ff").ok) {
    warn(
      "Git doesn't know yet whether git pull should merge or rebase when both sides have new commits.",
      "git config --global pull.rebase false, so git pull merges, as this course does.",
    );
  }
  const counts = git("rev-list", "--left-right", "--count", "main...main@{upstream}");
  const [ahead, behind] = counts.out.split(/\s+/).map(Number);
  if (ahead && behind) {
    warn(
      `As of your last fetch, main and ${upstream.out} have both moved on: ${ahead} commit(s) here, ${behind} there.`,
      "git pull to merge GitHub's commits into yours, then git push.",
    );
  } else if (ahead && setupOnly()) {
    warn("main has this course's setup commit, which isn't on GitHub yet.", "git push.");
  } else if (ahead) {
    warn(
      `main has ${ahead} commit(s) that aren't on GitHub yet, but changes go through pull requests now.`,
      "git switch -c <branch-name> to keep them on a new branch, then git branch -f main origin/main to move main back. Push the branch and open a pull request.",
    );
  } else if (behind) {
    warn(
      `As of your last fetch, GitHub has ${behind} commit(s) that main doesn't have yet.`,
      "git pull.",
    );
  }
  return true;
}

function checkConflictMarkers() {
  const markers = git("grep", "-l", "-E", "^(<<<<<<<|>>>>>>>)( |$)|^=======$");
  if (markers.ok && markers.out) {
    const files = markers.out.split("\n");
    fail(
      `Conflict markers are still in ${files.join(", ")}.`,
      "open each file, keep what's right from both sides, delete the <<<<<<<, ======= and >>>>>>> lines, then commit.",
    );
    return false;
  }
  pass("No file has leftover conflict markers.");
  return true;
}

// The Thanksgiving hours: two issues change the same line, so a merge has to keep both.
function checkThanksgiving() {
  const file = join(projectDir, "src", "data", "holidays.js");
  if (!existsSync(file)) {
    return;
  }
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((text) => text.includes('"Thanksgiving"'));
  if (!line) {
    return;
  }
  const opensAt8 = line.includes('open: "08:00"');
  const closesAt1 = line.includes('close: "13:00"');
  if (opensAt8 && closesAt1) {
    pass("Thanksgiving's hours keep both changes: 8 a.m. to 1 p.m.");
  } else if (opensAt8 || closesAt1) {
    warn(
      `Thanksgiving's hours have only one of the two changes: ${opensAt8 ? "it opens at 8 a.m. but doesn't close at 1 p.m." : "it closes at 1 p.m. but doesn't open at 8 a.m."}`,
      "if both issues are done, the merge kept only one side. Fix the line in src/data/holidays.js and commit.",
    );
  }
}

// A deal priced below $1 a dozen eggs is a typo, not a deal.
function checkEggPrice() {
  const file = join(projectDir, "src", "data", "deals.js");
  if (!existsSync(file)) {
    return;
  }
  const eggs = readFileSync(file, "utf8")
    .split("\n")
    .find((text) => text.includes('"Large brown eggs"'));
  const sale = eggs && /sale:\s*(\d+)/.exec(eggs);
  if (sale && Number(sale[1]) < 100) {
    fail(
      `Eggs are on sale for ${sale[1]}¢ a dozen in src/data/deals.js, which looks like a typo.`,
      "find the commit that changed it with git log -p src/data/deals.js, then git revert <hash> and push.",
    );
  }
}

async function checkGitHub(repository) {
  // One request answers both: whether the public repository exists, and where its main is.
  // An empty repository answers 409: it exists and is public, but nothing is pushed yet.
  const branch = await gitHub(`/repos/${repository}/commits/main`);
  if (branch.status === 404) {
    fail(
      `GitHub shows no public repository ${repository} with a main branch.`,
      "make sure the repository exists, is public (Settings, General, Danger Zone, Change visibility) and has main pushed.",
    );
    return;
  }
  // No answer at all, or the hourly limit: the issues would fail the same way.
  if (branch.status === 0 || branch.limited) {
    gitHubSkipped(branch, "the GitHub checks");
    return;
  }
  const local = git("rev-parse", "main").out;
  if (branch.status === 409) {
    pass(`GitHub has your public repository ${repository}, still empty.`);
    // Without an upstream, checkUpstream already said that main isn't pushed yet.
    if (git("rev-parse", "--abbrev-ref", "main@{upstream}").ok) {
      warn("GitHub's repository is empty, so main isn't on it yet.", "git push.");
    }
  } else if (!branch.body) {
    gitHubSkipped(branch, "the checks for GitHub's main");
  } else if (branch.body.sha === local) {
    pass(`GitHub has your public repository ${repository}.`);
    pass("GitHub's main is the same commit as yours.");
  } else {
    pass(`GitHub has your public repository ${repository}.`);
    const known = git("cat-file", "-e", `${branch.body.sha}^{commit}`).ok;
    warn(
      `GitHub's main is at ${branch.body.sha.slice(0, 7)}, yours is at ${local.slice(0, 7)}.`,
      known
        ? "git push, so GitHub gets your commits. If you just did, wait a minute: GitHub's answer can be a minute old."
        : "git pull to get GitHub's commits, then git push.",
    );
  }

  // The issues are found by title, whether or not main is on GitHub yet.
  const issues = await gitHub(`/repos/${repository}/issues?state=all&per_page=100`);
  if (!Array.isArray(issues.body)) {
    gitHubSkipped(issues, "the issue checks");
    return;
  }
  const byTitle = new Map(
    issues.body
      .filter((issue) => !issue.pull_request)
      .map((issue) => [issue.title.trim().toLowerCase(), issue]),
  );
  issueGroups.forEach((titles, index) => {
    const current = index === issueGroups.length - 1;
    const found = titles.map((title) => [title, byTitle.get(title.toLowerCase())]);
    if (found.every(([, issue]) => !issue)) {
      if (current) {
        warn(
          "None of this week's issues are on GitHub yet.",
          "create them from the lesson, with their titles exactly as given.",
        );
      }
      return;
    }
    for (const [title, issue] of found) {
      if (!issue) {
        warn(
          `There's no issue "${title}" yet.`,
          "create it from the lesson, with the title exactly as given. If you just did, wait a minute: GitHub's answer can be a minute old.",
        );
      } else if (issue.state === "closed") {
        pass(`Issue #${issue.number} "${title}" is closed.`);
      } else {
        warn(
          `Issue #${issue.number} "${title}" is still open.`,
          `once its work is on main, close it: Closes #${issue.number} in a pull request's description, or close it on GitHub. If you just did, wait a minute: GitHub's answer can be a minute old.`,
        );
      }
    }
  });

  // The review is graded in course 4: once its turkey issue exists, and until a later
  // course's issues do.
  const later = issueGroups[2].some((title) => byTitle.has(title.toLowerCase()));
  if (!byTitle.has(reviewedPullRequest.toLowerCase()) || later) {
    return;
  }
  // The issues list has the pull requests too, so the review's pull request is found there
  // by its title. GitHub fills in a new pull request's title from its first commit, so if
  // the title differs, it's found by the branch the lesson names.
  let reviewed = issues.body.find(
    (issue) =>
      issue.pull_request && issue.title.trim().toLowerCase() === reviewedPullRequest.toLowerCase(),
  );
  if (!reviewed) {
    const pulls = await gitHub(
      `/repos/${repository}/pulls?state=all&head=${repository.split("/")[0]}:turkey-preorder`,
    );
    if (!Array.isArray(pulls.body)) {
      gitHubSkipped(pulls, "the checks for the pull request review");
      return;
    }
    reviewed = pulls.body[0];
  }
  if (!reviewed) {
    warn(
      `There's no pull request "${reviewedPullRequest}" yet.`,
      "push the draft's branch, turkey-preorder, and open its pull request with that title.",
    );
    return;
  }
  {
    const comments = await gitHub(
      `/repos/${repository}/pulls/${reviewed.number}/comments?per_page=100`,
    );
    if (!Array.isArray(comments.body)) {
      gitHubSkipped(comments, "the checks for the pull request review");
    } else if (comments.body.length) {
      pass(
        `Pull request #${reviewed.number} "${reviewed.title}" has ${comments.body.length} line comment(s) from its review.`,
      );
    } else {
      warn(
        `Pull request #${reviewed.number} "${reviewed.title}" has no line comments yet.`,
        "review it in the Files changed tab: click the + next to a line, write what's wrong and why, and add the comment.",
      );
    }
  }
}

if (checkGitInstalled() && checkRepository()) {
  checkIdentity();
  checkIgnored();
  checkCommits();
  checkMoveToVite();
  const repository = checkRemote();
  if (repository) {
    checkUpstream();
  }
  // The data checks read the files, which only make sense without conflict markers.
  if (checkConflictMarkers()) {
    checkThanksgiving();
    checkEggPrice();
  }
  const pkg = readPackageJson();
  checkPrettier(pkg);
  checkLint(pkg);

  if (repository) {
    await checkGitHub(repository);
    await checkGoneBranches(repository);
    if (existsSync(deployWorkflow)) {
      await checkDeploy(repository);
    }
  }
  checkClean();
}
report();
