// Decides the weekly release (release.yaml). The next patch version is released only when every commit since the
// latest vX.Y.Z tag, merge commits aside, is Renovate's, and they changed something outside .github/ and
// renovate.json. Anything else is left to a release by hand.
//
// Run as a script, it prints the reason, and in GitHub Actions writes version and message to $GITHUB_OUTPUT;
// version is empty when nothing is released. Its tests: `node --test .github/release/plan.test.mjs`.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const RENOVATE = "renovate[bot]";

const versionTag = /^v(\d+)\.(\d+)\.(\d+)$/;

export function latestVersionTag(tags) {
  let latest;
  for (const tag of tags) {
    const match = versionTag.exec(tag);
    if (!match) continue;
    const parts = match.slice(1).map(Number);
    if (!latest || compare(parts, latest.parts) > 0) latest = { tag, parts };
  }
  return latest?.tag;
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    if (d !== 0) return d;
  }
  return 0;
}

function nextPatch(tag) {
  const [major, minor, patch] = tag.slice(1).split(".").map(Number);
  return `v${major}.${minor}.${patch + 1}`;
}

// The image is built from everything else (the Dockerfile copies the whole checkout, and .dockerignore leaves
// .github/ out), so a change to these alone does not reach it.
function outsideRelease(path) {
  return path.startsWith(".github/") || path === "renovate.json";
}

function lines(output) {
  return output.split("\n").filter((line) => line !== "");
}

export function planRelease(cwd) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

  const tag = latestVersionTag(lines(git("tag", "--list", "--merged", "HEAD")));
  if (!tag) return { reason: "HEAD から届く vX.Y.Z のタグがないので、リリースしない" };

  const commits = lines(git("log", "--no-merges", "--reverse", "--format=%an%x00%s", `${tag}..HEAD`)).map((line) => {
    const [author = "", subject = ""] = line.split("\0");
    return { author, subject };
  });
  if (commits.length === 0) return { reason: `${tag} からマージ以外のコミットがないので、リリースしない` };

  const others = [...new Set(commits.map((c) => c.author).filter((author) => author !== RENOVATE))];
  if (others.length > 0) {
    return { reason: `${tag} から ${RENOVATE} 以外のコミット（${others.join("、")}）があるので、手のリリースに任せる` };
  }

  const changed = lines(git("diff", "--name-only", tag, "HEAD")).filter((path) => !outsideRelease(path));
  if (changed.length === 0) {
    return { reason: `${tag} からの ${RENOVATE} の変更は .github/ と renovate.json だけなので、リリースしない` };
  }

  const version = nextPatch(tag);
  return {
    version,
    message: [`${version}: 依存の更新（Renovate）`, "", ...commits.map((c) => `- ${c.subject}`)].join("\n"),
    reason: `${tag} から ${RENOVATE} のコミットだけで、イメージの中身が変わった（${changed.join("、")}）ので、${version} を出す`,
  };
}

if (import.meta.main) {
  const plan = planRelease(process.cwd());
  console.log(plan.reason);
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    const delimiter = `EOF-${process.pid}-${Date.now()}`;
    appendFileSync(output, `version=${plan.version ?? ""}\nmessage<<${delimiter}\n${plan.message ?? ""}\n${delimiter}\n`);
  }
}
