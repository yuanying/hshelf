// The release's decision (plan.mjs), tried against throwaway git repositories.
// Run with `node --test .github/release/plan.test.mjs`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { latestVersionTag, planRelease, summary } from "./plan.mjs";

const user = "OTSUKA, Yuanying";
const renovate = "renovate[bot]";
const responder = "fraction-vuln-responder[bot]";

function git(dir, args, author = user) {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: `${author}@example.com`,
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: `${author}@example.com`,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

function repository() {
  const dir = mkdtempSync(join(tmpdir(), "release-plan-"));
  git(dir, ["init", "--quiet", "--initial-branch=main"]);
  commit(dir, user, "First", { Dockerfile: "FROM ruby:4.0.9-alpine3.24\n" });
  return dir;
}

function commit(dir, author, subject, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  git(dir, ["add", "--all"], author);
  git(dir, ["commit", "--quiet", "-m", subject], author);
}

function tag(dir, name) {
  git(dir, ["tag", "-a", name, "-m", `${name}: release`]);
}

describe("latestVersionTag", () => {
  it("compares vX.Y.Z tags as versions, not as text", () => {
    assert.equal(latestVersionTag(["v0.9.0", "v0.10.0", "v0.2.1"]), "v0.10.0");
  });

  it("ignores tags of another shape", () => {
    assert.equal(latestVersionTag(["v0.8.0", "v0.17.0.1", "v1.0.0-rc.1", "release-2", "0.9.0"]), "v0.8.0");
  });

  it("finds none among no tags", () => {
    assert.equal(latestVersionTag([]), undefined);
  });
});

describe("planRelease", () => {
  it("releases the next patch when only Renovate committed and the release's content changed", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });
    commit(dir, renovate, "Update github-actions", { ".github/workflows/image.yaml": "name: Image\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, "v1.0.1");
    assert.match(plan.reason, /v1\.0\.0/);
    assert.equal(
      plan.message,
      ["v1.0.1: 依存の更新（Renovate）", "", "- Update ruby Docker tag to v4.0.10", "- Update github-actions"].join("\n"),
    );
  });

  it("leaves a merge commit out of the authors", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    git(dir, ["checkout", "--quiet", "-b", "renovate/sinatra"]);
    commit(dir, renovate, "Update dependency sinatra to v4.2.2", { "Gemfile.lock": "sinatra (4.2.2)\n" });
    git(dir, ["checkout", "--quiet", "main"]);
    git(dir, ["merge", "--quiet", "--no-ff", "-m", "Merge pull request #1 from yuanying/renovate/sinatra", "renovate/sinatra"]);

    assert.equal(planRelease(dir).version, "v1.0.1");
  });

  it("releases nothing when a commit of someone other than Renovate is among them", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });
    commit(dir, user, "Show the file name", { "app/server.rb": "# server\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /OTSUKA, Yuanying/);
  });

  it("releases nothing when Renovate changed only .github/ and renovate.json", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, renovate, "Update github-actions", { ".github/workflows/image.yaml": "name: Image\n" });
    commit(dir, renovate, "Migrate config renovate.json", { "renovate.json": "{}\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /\.github\/ と renovate\.json/);
  });

  it("releases nothing when nothing was committed since the tag", () => {
    const dir = repository();
    tag(dir, "v1.0.0");

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /コミットがない/);
  });

  it("counts from the latest vX.Y.Z tag and ignores a four-part one", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, user, "By hand", { "app/server.rb": "# server\n" });
    tag(dir, "v1.0.0.1");
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /v1\.0\.0\b/);
  });

  it("reads a tag the checkout's HEAD does not reach as no tag of its own", () => {
    const dir = repository();
    git(dir, ["checkout", "--quiet", "-b", "elsewhere"]);
    commit(dir, user, "Elsewhere", { "app/server.rb": "# server\n" });
    tag(dir, "v9.0.0");
    git(dir, ["checkout", "--quiet", "main"]);
    tag(dir, "v1.0.0");
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });

    assert.equal(planRelease(dir).version, "v1.0.1");
  });

  it("releases the next patch when only the vulnerability responder committed", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, responder, "Update json to 2.18.1 for CVE-2026-33210", { "Gemfile.lock": "json (2.18.1)\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, "v1.0.1");
    assert.equal(
      plan.message,
      ["v1.0.1: 脆弱性の修正（fraction-vuln-responder）", "", "- Update json to 2.18.1 for CVE-2026-33210"].join("\n"),
    );
  });

  it("releases the next patch when the vulnerability responder and Renovate committed", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });
    commit(dir, responder, "Update json to 2.18.1 for CVE-2026-33210", { "Gemfile.lock": "json (2.18.1)\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, "v1.0.1");
    assert.equal(
      plan.message,
      [
        "v1.0.1: 脆弱性の修正と依存の更新（fraction-vuln-responder・Renovate）",
        "",
        "- Update ruby Docker tag to v4.0.10",
        "- Update json to 2.18.1 for CVE-2026-33210",
      ].join("\n"),
    );
  });

  it("releases nothing when a person committed beside the vulnerability responder, and names the commits", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, responder, "Update json to 2.18.1 for CVE-2026-33210", { "Gemfile.lock": "json (2.18.1)\n" });
    commit(dir, user, "Show the file name", { "app/server.rb": "# server\n" });
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /OTSUKA, Yuanying/);
    assert.equal(plan.next, "v1.0.1");
    assert.equal(plan.head, git(dir, ["rev-parse", "HEAD"]).trim());
    assert.deepEqual(
      plan.blocked.map((c) => [c.author, c.subject]),
      [[user, "Show the file name"]],
    );
    assert.match(plan.blocked[0].sha, /^[0-9a-f]{40}$/);
  });

  it("releases nothing when there is no vX.Y.Z tag", () => {
    const dir = repository();
    commit(dir, renovate, "Update ruby Docker tag to v4.0.10", { Dockerfile: "FROM ruby:4.0.10-alpine3.24\n" });

    const plan = planRelease(dir);

    assert.equal(plan.version, undefined);
    assert.match(plan.reason, /vX\.Y\.Z のタグがない/);
  });
});

describe("summary", () => {
  it("lists the commits that stopped the release and the commands to release by hand", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, responder, "Update json to 2.18.1 for CVE-2026-33210", { "Gemfile.lock": "json (2.18.1)\n" });
    commit(dir, user, "Show the file name", { "app/server.rb": "# server\n" });
    const plan = planRelease(dir);

    const text = summary(plan);

    assert.ok(text.includes(plan.reason));
    assert.ok(text.includes(`${plan.blocked[0].sha.slice(0, 7)}`));
    assert.ok(text.includes("OTSUKA, Yuanying"));
    assert.ok(text.includes("Show the file name"));
    assert.ok(!text.includes("Update json to 2.18.1"));
    assert.ok(text.includes(`git tag -a v1.0.1 ${plan.head}`));
    assert.ok(text.includes("git push origin v1.0.1"));
  });

  it("gives the reason alone when the release goes out", () => {
    const dir = repository();
    tag(dir, "v1.0.0");
    commit(dir, responder, "Update json to 2.18.1 for CVE-2026-33210", { "Gemfile.lock": "json (2.18.1)\n" });
    const plan = planRelease(dir);

    const text = summary(plan);

    assert.ok(text.includes(plan.reason));
    assert.ok(!text.includes("git tag"));
  });
});
