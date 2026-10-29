"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

function git(cwd, args, { signal, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile("git", args, {
      cwd, signal, timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}
function component(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) || value.includes("..") || value.endsWith(".") || value.endsWith(".lock")) {
    throw new Error(`${label} không hợp lệ; dùng chữ, số, dấu -, _ hoặc . trong một thành phần.`);
  }
  return value;
}
async function repository(folder) {
  if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new Error("Nhập đường dẫn tuyệt đối tới repo local.");
  const root = fs.realpathSync(folder);
  const top = fs.realpathSync(await git(root, ["rev-parse", "--show-toplevel"]));
  if (root !== top) throw new Error("Đường dẫn phải là thư mục gốc của Git repository.");
  const common = await git(root, ["rev-parse", "--git-common-dir"]);
  return { path: root, commonDir: fs.realpathSync(path.resolve(root, common)) };
}
async function exists(cwd, ref, options) {
  try { await git(cwd, ["show-ref", "--verify", "--quiet", ref], options); return true; }
  catch (e) { if (options?.signal?.aborted) throw e; return false; }
}
async function prepare(project, task, dir, options) {
  const cwd = project.path, remote = project.remote;
  await git(cwd, ["check-ref-format", "--branch", task.branch], options);
  await git(cwd, ["check-ref-format", "--branch", task.featureBranch], options);
  if (task.workspace) {
    // A retry may reuse only the exact worktree previously allocated to this task.
    const repo = await repository(task.workspace);
    if (repo.commonDir !== project.commonDir || await git(task.workspace, ["branch", "--show-current"], options) !== task.branch) {
      throw new Error("Worktree của task đã thay đổi repo hoặc nhánh; cần quản lý kiểm tra.");
    }
    return task.workspace;
  }
  await git(cwd, ["remote", "get-url", remote], options);
  await git(cwd, ["fetch", "--prune", "--no-tags", remote], options);
  const featureRemote = `refs/remotes/${remote}/${task.featureBranch}`;
  const baseRemote = `refs/remotes/${remote}/${project.featureBase}`;
  const localFeature = `refs/heads/${task.featureBranch}`;
  let base;
  if (await exists(cwd, featureRemote, options)) base = featureRemote;
  else if (await exists(cwd, localFeature, options)) base = localFeature;
  else {
    if (!await exists(cwd, baseRemote, options)) throw new Error(`Thiếu nhánh ${remote}/${project.featureBase}.`);
    await git(cwd, ["branch", task.featureBranch, baseRemote], options);
    base = localFeature;
  }
  fs.mkdirSync(dir, { recursive: true });
  const workspace = path.join(dir, task.id);
  // This path is persisted before preparation, so interrupted creation is also recoverable.
  if (fs.existsSync(workspace)) {
    const current = await repository(workspace);
    if (current.commonDir !== project.commonDir || await git(workspace, ["branch", "--show-current"], options) !== task.branch) {
      throw new Error("Đường dẫn worktree đã tồn tại và không thuộc task.");
    }
    return workspace;
  }
  if (await exists(cwd, `refs/heads/${task.branch}`, options)) {
    throw new Error(`Nhánh ${task.branch} đã tồn tại ngoài task này; không tự ghi đè hoặc dùng lại.`);
  }
  await git(cwd, ["worktree", "add", "-b", task.branch, workspace, base], options);
  return workspace;
}
module.exports = { git, component, repository, prepare };
