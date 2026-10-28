// Decides the release (release.yaml), weekly and on the merge of a vulnerability fix. The next patch version is
// released only when every commit since the latest vX.Y.Z tag, merge commits aside, is Renovate's or the
// vulnerability responder's, and they changed something outside .github/ and renovate.json. Anything else is left to
// a release by hand.
//
// Run as a script, it prints the reason, and in GitHub Actions writes version and message to $GITHUB_OUTPUT and the
// summary to $GITHUB_STEP_SUMMARY; version is empty when nothing is released. Its tests:
// `node --test .github/release/plan.test.mjs`.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const RENOVATE = "renovate[bot]";
// The GitHub App of the fraction-agents' vulnerability responder, which opens the fixes on vuln-responder/ branches.
export const VULN_RESPONDER = "fraction-vuln-responder[bot]";

const BOTS = [RENOVATE, VULN_RESPONDER];

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

  const commits = lines(git("log", "--no-merges", "--reverse", "--format=%H%x00%an%x00%s", `${tag}..HEAD`)).map(
    (line) => {
      const [sha = "", author = "", subject = ""] = line.split("\0");
      return { sha, author, subject };
    },
  );
  if (commits.length === 0) return { reason: `${tag} からマージ以外のコミットがないので、リリースしない` };

  const bots = BOTS.join(" と ");
  const blocked = commits.filter((c) => !BOTS.includes(c.author));
  if (blocked.length > 0) {
    const others = [...new Set(blocked.map((c) => c.author))];
    return {
      reason: `${tag} から ${bots} 以外のコミット（${others.join("、")}）があるので、手のリリースに任せる`,
      blocked,
      next: nextPatch(tag),
      head: git("rev-parse", "HEAD").trim(),
    };
  }

  const changed = lines(git("diff", "--name-only", tag, "HEAD")).filter((path) => !outsideRelease(path));
  if (changed.length === 0) {
    return { reason: `${tag} からの ${bots} の変更は .github/ と renovate.json だけなので、リリースしない` };
  }

  const version = nextPatch(tag);
  return {
    version,
    message: [`${version}: ${title(commits)}`, "", ...commits.map((c) => `- ${c.subject}`)].join("\n"),
    reason: `${tag} から ${bots} のコミットだけで、イメージの中身が変わった（${changed.join("、")}）ので、${version} を出す`,
  };
}

function title(commits) {
  const fixes = commits.some((c) => c.author === VULN_RESPONDER);
  const updates = commits.some((c) => c.author === RENOVATE);
  if (fixes && updates) return "脆弱性の修正と依存の更新（fraction-vuln-responder・Renovate）";
  if (fixes) return "脆弱性の修正（fraction-vuln-responder）";
  return "依存の更新（Renovate）";
}

// The run's summary in Markdown. When the release is stopped, it names the commits that stopped it and how to
// release by hand: a tag pushed by hand releases through image.yaml.
export function summary(plan) {
  const text = [plan.reason];
  if (plan.blocked) {
    text.push(
      "",
      "止めたコミット:",
      "",
      ...plan.blocked.map((c) => `- \`${c.sha.slice(0, 7)}\` ${c.author}: ${c.subject}`),
      "",
      "中身を確かめてから、手で出すには:",
      "",
      "```sh",
      "git fetch origin --tags",
      `git tag -a ${plan.next} ${plan.head} -m "${plan.next}: <変更の要約>"`,
      `git push origin ${plan.next}`,
      "```",
    );
  }
  return `${text.join("\n")}\n`;
}

if (import.meta.main) {
  const plan = planRelease(process.cwd());
  console.log(plan.reason);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(plan));
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    const delimiter = `EOF-${process.pid}-${Date.now()}`;
    appendFileSync(output, `version=${plan.version ?? ""}\nmessage<<${delimiter}\n${plan.message ?? ""}\n${delimiter}\n`);
  }
}
