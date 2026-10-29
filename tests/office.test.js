"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const { Office } = require("../lib/office");
const { git } = require("../lib/office-git");
const { authorize } = require("../lib/office-api");
const fake = path.join(__dirname, "fixtures", "codex.js");
fs.chmodSync(fake, 0o755);
const policy = { managerUsername: "tiennm55", featureBase: "master" };
async function waitFor(check, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 25)); }
  throw new Error("Timed out waiting for test condition");
}
async function fixture(t, options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "office-test-")); let office;
  t.after(async () => { if (office && !office.closing) await office.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const seed = path.join(tmp, "seed"), remote = path.join(tmp, "remote.git"); fs.mkdirSync(seed);
  await git(tmp, ["init", "--bare", "--initial-branch=master", remote]);
  await git(seed, ["init", "--initial-branch=master"]);
  await git(seed, ["config", "user.name", "Office Test"]); await git(seed, ["config", "user.email", "office-test@example.invalid"]);
  fs.writeFileSync(path.join(seed, "README.md"), "Fixture repository\n");
  await git(seed, ["add", "."]); await git(seed, ["commit", "-m", "Fixture seed"]);
  await git(seed, ["remote", "add", "origin", remote]); await git(seed, ["push", "origin", "master:master", "master:testing"]);
  const repo = path.join(tmp, "project"); await git(tmp, ["clone", remote, repo]);
  office = new Office({ dataDir: tmp, policy, codexBin: fake, ...options });
  const { project, employee } = await office.addProject({ name: "Inventory", path: repo, employeeName: "An" });
  return { tmp, repo, remote, seed, office, project, employee, replaceOffice(next) { office = next; } };
}
const task = (f, request = "Implement the change") => f.office.createTask(f.project.id, { title: "Task fixture", request });
const confirm = (f, value, taskId = "DA-int") => f.office.confirmTask(value.id, { taskId, confirmed: true });

test("task ID confirmation gates all execution; names remain separate from Git username", async t => {
  const f = await fixture(t), value = task(f);
  assert.equal(value.status, "awaiting_id"); assert.equal(f.office.view().runs.length, 0);
  assert.throws(() => f.office.confirmTask(value.id, { taskId: "DA-int" }), /xác nhận/);
  assert.throws(() => f.office.confirmTask(value.id, { taskId: "x/../../bad", confirmed: true }), /không hợp lệ/);
  f.office.renameEmployee(f.employee.id, { name: "Bình · Phụ trách" });
  confirm(f, value);
  const finished = await waitFor(() => { const v = f.office.get("task", value.id); return v.status === "review" && v; });
  assert.equal(finished.branch, "tiennm55/DA-int"); assert.equal(f.office.get("employee", f.employee.id).name, "Bình · Phụ trách");
  assert.deepEqual(finished.mergeRequests.map(r => r.target), ["feature/DA-int", "master", "testing"]);
  assert.equal(fs.existsSync(path.join(f.repo, "agent-output.txt")), false);
  assert.equal(fs.existsSync(path.join(finished.workspace, "agent-output.txt")), true);
  assert.equal(await git(f.repo, ["branch", "--show-current"]), "master");
  assert.equal(await git(finished.workspace, ["branch", "--show-current"]), "tiennm55/DA-int");
  const args = JSON.parse(fs.readFileSync(path.join(finished.workspace, "fixture-args.json")));
  assert(args.includes("sandbox_workspace_write.network_access=false")); assert(args.includes("workspace-write"));
  assert.equal(args.at(-1), "-"); assert(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
  const logs = f.office.logs(f.office.view().runs[0].id); assert(logs.rows.some(r => r.kind === "event")); assert(logs.next > 0);
  assert.deepEqual(f.office.logs(f.office.view().runs[0].id, logs.next).rows, []);
  const duplicate = task(f); assert.throws(() => confirm(f, duplicate), /đã tồn tại/);
});

test("continuation resumes the exact session and preserves worktree; questions persist", async t => {
  const f = await fixture(t), value = task(f, "FIXTURE_ASK"); confirm(f, value);
  const first = await waitFor(() => { const v = f.office.get("task", value.id); return v.status === "needs_input" && v; });
  assert.equal(first.question, "API trả mã lỗi nào?"); assert(first.sessionId);
  f.office.continueTask(value.id, { message: "FIXTURE_ANSWER Use HTTP 409" });
  const next = await waitFor(() => { const v = f.office.get("task", value.id); return v.status === "review" && v; });
  assert.equal(next.workspace, first.workspace); assert.equal(next.sessionId, first.sessionId);
  assert.equal(f.office.view().runs.length, 2);
  const args = JSON.parse(fs.readFileSync(path.join(next.workspace, "fixture-args.json")));
  assert.equal(args[args.indexOf("resume") + 1], first.sessionId);
});

test("FIFO enforces one task per project and a global concurrency limit", async t => {
  const f = await fixture(t, { maxConcurrent: 2 });
  const secondRemote = path.join(f.tmp, "second.git"), secondRepo = path.join(f.tmp, "second");
  await git(f.tmp, ["clone", "--bare", f.remote, secondRemote]); await git(f.tmp, ["clone", secondRemote, secondRepo]);
  const { project: p2 } = await f.office.addProject({ name: "Frontend", path: secondRepo, employeeName: "Linh" });
  const thirdRemote = path.join(f.tmp, "third.git"), thirdRepo = path.join(f.tmp, "third");
  await git(f.tmp, ["clone", "--bare", f.remote, thirdRemote]); await git(f.tmp, ["clone", thirdRemote, thirdRepo]);
  const { project: p3 } = await f.office.addProject({ name: "Core", path: thirdRepo, employeeName: "Minh" });
  const a = task(f, "FIXTURE_SLOW"), b = task(f, "FIXTURE_SLOW");
  const c = f.office.createTask(p2.id, { title: "Parallel", request: "FIXTURE_SLOW" });
  const d = f.office.createTask(p3.id, { title: "Limited", request: "FIXTURE_SLOW" });
  confirm(f, a, "A"); confirm(f, b, "B"); f.office.confirmTask(c.id, { taskId: "C", confirmed: true });
  f.office.confirmTask(d.id, { taskId: "D", confirmed: true });
  assert.equal(f.office.active.size, 2); assert.equal(f.office.get("task", b.id).status, "queued");
  assert.equal(f.office.get("task", d.id).status, "queued");
  const snapshots = [];
  await waitFor(() => {
    const view = f.office.view(); const active = view.tasks.filter(t => ["preparing", "running", "stopping"].includes(t.status));
    snapshots.push(active.length); assert(active.length <= 2); assert(new Set(active.map(t => t.projectId)).size === active.length);
    return view.tasks.every(t => t.status === "review");
  });
  assert(snapshots.includes(2));
  const runs = f.office.view().runs, ar = runs.find(r => r.taskId === a.id), br = runs.find(r => r.taskId === b.id);
  assert(br.startedAt >= ar.endedAt);
});

test("stop terminates Codex process tree and releases the project queue", async t => {
  const f = await fixture(t), hold = task(f, "FIXTURE_HOLD"), next = task(f);
  confirm(f, hold, "Hold"); confirm(f, next, "Next");
  const running = await waitFor(() => { const v = f.office.get("task", hold.id); return v.workspace && fs.existsSync(path.join(v.workspace, "fixture-child.pid")) && v; });
  f.office.stop(hold.id);
  await waitFor(() => f.office.get("task", hold.id).status === "stopped" && f.office.get("task", next.id).status === "review");
  if (process.platform !== "win32") {
    assert.equal(fs.readFileSync(path.join(running.workspace, "fixture-child-stopped"), "utf8"), "closed\n");
  }
});

test("failed output and missing executables are not reported as successful work", async t => {
  const f = await fixture(t), a = task(f, "FIXTURE_BAD_JSON"); confirm(f, a, "Bad");
  await waitFor(() => f.office.get("task", a.id).status === "failed");
  assert.match(f.office.get("task", a.id).error, /JSON/);
  f.office.codexBin = path.join(f.tmp, "no-such-codex");
  const b = task(f); confirm(f, b, "Missing");
  await waitFor(() => f.office.get("task", b.id).status === "failed");
  assert.match(f.office.get("task", b.id).error, /Không tìm thấy Codex/);
});

test("restart persists task/report/name, recovers interrupted tasks and rejects a second owner", async t => {
  const f = await fixture(t), value = task(f); confirm(f, value);
  await waitFor(() => f.office.get("task", value.id).status === "review");
  assert.throws(() => new Office({ dataDir: f.tmp, policy }), /server khác/);
  const interrupted = task(f); f.office.store.put("task", { ...interrupted, status: "preparing" });
  f.office.renameEmployee(f.employee.id, { name: "Tên giữ sau khởi động" });
  await f.office.close();
  const office = new Office({ dataDir: f.tmp, policy, codexBin: fake }); f.replaceOffice(office);
  assert.equal(office.get("task", value.id).status, "review"); assert(office.get("task", value.id).report.summary);
  assert.equal(office.get("task", interrupted.id).status, "interrupted");
  assert.equal(office.get("employee", f.employee.id).name, "Tên giữ sau khởi động"); assert.equal(office.active.size, 0);
});

test("Git preparation refuses branch collisions and leaves existing changes untouched", async t => {
  const f = await fixture(t); await git(f.repo, ["branch", "tiennm55/Collision"]);
  fs.writeFileSync(path.join(f.repo, "README.md"), "Manager's uncommitted work\n");
  const value = task(f); confirm(f, value, "Collision");
  await waitFor(() => f.office.get("task", value.id).status === "failed");
  assert.match(f.office.get("task", value.id).error, /đã tồn tại/);
  assert.equal(fs.readFileSync(path.join(f.repo, "README.md"), "utf8"), "Manager's uncommitted work\n");
});

test("control API denies remote peers, cross-origin requests and DNS rebinding", () => {
  const base = { method: "POST", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:7788", origin: "http://localhost:7788", "x-office-client": "local-ui" } };
  assert.equal(authorize(base), null);
  assert(authorize({ ...base, socket: { remoteAddress: "10.0.0.1" } }));
  assert(authorize({ ...base, headers: { ...base.headers, origin: "http://evil.invalid" } }));
  assert(authorize({ ...base, headers: { ...base.headers, host: "evil.invalid:7788" } }));
  assert(authorize({ ...base, headers: { host: "localhost:7788" } }));
});
