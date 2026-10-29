"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");
const { OfficeStore } = require("./office-store");
const { component, repository, prepare, git } = require("./office-git");

const uid = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const RUNNING = new Set(["preparing", "running", "stopping"]);
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["review", "needs_input", "blocked"] },
    summary: { type: "string" }, question: { type: "string" },
    tests: { type: "array", items: { type: "string" } },
  }, required: ["status", "summary", "question", "tests"],
};
function text(value, label, max = 20000) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) throw new Error(`${label} trống hoặc quá dài.`);
  return value.trim();
}

class Office {
  constructor({ dataDir, policy, maxConcurrent = 2, codexBin = "codex", model = "", network = false, timeoutMs = 3600000, redact = s => s }) {
    this.dir = path.join(dataDir, "office");
    this.store = new OfficeStore(this.dir);
    this.policy = policy; this.maxConcurrent = maxConcurrent; this.codexBin = codexBin;
    this.model = model; this.network = network; this.timeoutMs = timeoutMs; this.redact = redact;
    this.active = new Map(); this.closing = false;
    for (const run of this.store.all("run")) {
      if (RUNNING.has(run.status) && run.pid) {
        let alive = true;
        try { process.kill(run.pid, 0); } catch (e) { alive = e.code !== "ESRCH"; }
        if (alive) {
          this.store.close();
          throw new Error(`Lượt Codex cũ (PID ${run.pid}) còn sống. Dừng process này trước khi mở lại văn phòng để tránh chạy trùng.`);
        }
      }
    }
    this.schemaFile = path.join(this.dir, "result-schema.json");
    fs.writeFileSync(this.schemaFile, JSON.stringify(schema));
    this.store.transaction(() => {
      for (const task of this.store.all("task")) {
        if (RUNNING.has(task.status) || task.status === "queued") {
          task.status = "interrupted";
          task.error = "Ứng dụng đã dừng trước khi task hoàn tất. Chọn tiếp tục để chạy lại.";
          task.updatedAt = stamp(); this.store.put("task", task);
        }
      }
      for (const run of this.store.all("run")) {
        if (RUNNING.has(run.status)) {
          run.status = "interrupted"; run.endedAt = stamp(); this.store.put("run", run);
        }
      }
    });
  }
  get(kind, id) {
    const row = this.store.get(kind, id);
    if (!row) throw new Error("Không tìm thấy " + kind + ".");
    return row;
  }
  view() {
    return {
      projects: this.store.all("project"), employees: this.store.all("employee"),
      tasks: this.store.all("task"), runs: this.store.all("run"),
      settings: { managerUsername: this.policy.managerUsername, featureBase: this.policy.featureBase, maxConcurrent: this.maxConcurrent, model: this.model, network: this.network },
    };
  }
  async addProject(input) {
    const name = text(input.name, "Tên project", 100), employeeName = text(input.employeeName, "Tên nhân viên", 100);
    const repo = await repository(input.path);
    const remote = component(input.remote || "origin", "Remote");
    const featureBase = component(input.featureBase || this.policy.featureBase, "Nhánh gốc");
    await git(repo.path, ["remote", "get-url", remote]);
    return this.store.transaction(() => {
      if (this.store.all("project").some(p => p.commonDir === repo.commonDir)) throw new Error("Repository này đã có phòng làm việc.");
      const project = { id: uid(), name, ...repo, remote, featureBase, createdAt: stamp() };
      const employee = { id: uid(), projectId: project.id, name: employeeName, role: "Phụ trách dự án", provider: "codex", createdAt: stamp() };
      this.store.put("project", project); this.store.put("employee", employee);
      return { project, employee };
    });
  }
  renameEmployee(id, input) {
    const employee = this.get("employee", id);
    employee.name = text(input.name, "Tên nhân viên", 100);
    return this.store.put("employee", employee);
  }
  createTask(projectId, input) {
    this.get("project", projectId);
    const employee = this.store.all("employee").find(e => e.projectId === projectId);
    const task = { id: uid(), projectId, employeeId: employee.id, title: text(input.title, "Tiêu đề", 200),
      request: text(input.request, "Yêu cầu"), status: "awaiting_id", taskId: null, branch: null,
      featureBranch: null, workspace: null, sessionId: null, messages: [], createdAt: stamp(), updatedAt: stamp(),
      question: `${employee.name}: Anh xác nhận ID task này là gì?`, error: null, report: null };
    return this.store.put("task", task);
  }
  confirmTask(id, input) {
    const task = this.get("task", id);
    if (task.status !== "awaiting_id") throw new Error("Task đã được xác nhận ID.");
    if (input.confirmed !== true) throw new Error("Quản lý cần xác nhận ID trước khi chạy.");
    const taskId = component(input.taskId, "Task ID");
    if (this.store.all("task").some(t => t.projectId === task.projectId && t.taskId === taskId)) throw new Error("Task ID này đã tồn tại trong project. Mở task cũ để tiếp tục.");
    const project = this.get("project", task.projectId);
    task.taskId = taskId; task.managerUsername = this.policy.managerUsername;
    task.branch = `${task.managerUsername}/${taskId}`; task.featureBranch = `feature/${taskId}`;
    task.mergeRequests = [{ source: task.branch, target: task.featureBranch }, { source: task.featureBranch, target: "master" }, { source: task.featureBranch, target: "testing" }]
      .map(pair => ({ ...pair, status: "pending", url: null }));
    task.featureBase = project.featureBase;
    task.status = "queued"; task.question = null; task.updatedAt = stamp();
    this.store.put("task", task); this.schedule(); return this.get("task", id);
  }
  continueTask(id, input) {
    const task = this.get("task", id);
    if (["awaiting_id", "queued", ...RUNNING].includes(task.status)) throw new Error("Task chưa thể tiếp tục từ trạng thái này.");
    const message = text(input.message, "Yêu cầu tiếp tục");
    task.messages.push({ role: "manager", text: message, at: stamp() });
    task.status = "queued"; task.error = null; task.question = null; task.updatedAt = stamp();
    this.store.put("task", task); this.schedule(); return this.get("task", id);
  }
  schedule() {
    if (this.closing) return;
    const projects = new Set([...this.active.values()].map(r => r.projectId));
    for (const task of this.store.all("task")) {
      if (this.active.size >= this.maxConcurrent) break;
      if (task.status !== "queued" || projects.has(task.projectId)) continue;
      const entry = { projectId: task.projectId, controller: new AbortController(), child: null, stop: false };
      this.active.set(task.id, entry); projects.add(task.projectId);
      entry.promise = this.execute(task.id, entry).finally(() => {
        this.active.delete(task.id); this.schedule();
      });
      // Failure inside the executor is persisted there. Never leave an unhandled rejection.
      entry.promise.catch(e => console.error("office runner:", this.redact(e.message)));
    }
  }
  log(runId, kind, content) {
    const row = { at: stamp(), kind, text: this.redact(String(content)).slice(0, 32000) };
    fs.appendFileSync(path.join(this.dir, runId + ".jsonl"), JSON.stringify(row) + "\n", { mode: 0o600 });
  }
  logs(runId, after = 0) {
    this.get("run", runId);
    // Seek by byte offset to avoid loading an entire long-running session per poll.
    const file = path.join(this.dir, runId + ".jsonl");
    if (!fs.existsSync(file)) return { rows: [], next: 0 };
    const size = fs.statSync(file).size;
    const start = Math.max(0, Math.min(Number.isSafeInteger(after) ? after : 0, size));
    const length = Math.min(size - start, 256 * 1024);
    const buffer = Buffer.alloc(length), fd = fs.openSync(file, "r");
    try { fs.readSync(fd, buffer, 0, length, start); } finally { fs.closeSync(fd); }
    const end = buffer.lastIndexOf(10);
    if (end < 0) return { rows: [], next: start };
    const rows = buffer.subarray(0, end).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return { rows, next: start + end + 1 };
  }
  prompt(task, project) {
    const employee = this.get("employee", task.employeeId);
    const rules = fs.readFileSync(path.join(__dirname, "..", "mau", "DOAN-CHEN-VAO-AGENTS.md"), "utf8").split("## Git —")[1];
    return `Bạn là ${employee.name}, phụ trách project ${project.name}. Trả lời bằng tiếng Việt.
Quản lý đã được hỏi và đã xác nhận task ID ${task.taskId} qua giao diện. Không hỏi lại ID của cùng task.
Nhánh cá nhân đã được runner chuẩn bị: ${task.branch}. Feature: ${task.featureBranch}.
Chỉ sửa code và chạy kiểm tra trong worktree hiện tại; không checkout nhánh khác.
Giai đoạn MVP này: không commit, push, merge hoặc tạo MR. Để nguyên diff cho quản lý review.
Ba MR được theo dõi là ${JSON.stringify(task.mergeRequests)}. Chưa có MR nghĩa là chưa hoàn tất quy trình Git.
Các quy tắc Git sẽ dùng ở giai đoạn bàn giao (trừ bước hỏi ID đã hoàn tất và bước push/MR đang hoãn):
${rules.split("{{MANAGER_USERNAME}}").join(task.managerUsername).split("{{FEATURE_BASE}}").join(task.featureBase)}
Nếu thiếu thông tin để tiếp tục, trả status needs_input và câu hỏi cụ thể. Nếu bị chặn, trả blocked.
Nếu hoàn thành sửa và kiểm tra, trả review (không khẳng định MR đã hoàn tất).
Không chạy vòng đọc hòm thư hoặc lịch DEV của hệ thống cũ; trả kết quả để runner bàn giao.
Yêu cầu gốc: ${task.title}\n${task.request}
${task.report ? "Báo cáo lượt trước: " + JSON.stringify(task.report) : ""}
Trao đổi bổ sung: ${JSON.stringify(task.messages.slice(-20))}`;
  }
  async execute(id, entry) {
    let task = this.get("task", id), run = { id: uid(), taskId: id, status: "preparing", startedAt: stamp(), endedAt: null,
      sessionId: task.sessionId, exitCode: null, error: null };
    task.status = "preparing"; task.updatedAt = stamp(); task.error = null;
    this.store.transaction(() => { this.store.put("task", task); this.store.put("run", run); });
    const project = this.get("project", task.projectId);
    try {
      this.log(run.id, "system", "Chuẩn bị nhánh và worktree riêng cho task.");
      const workspace = await prepare(project, task, path.join(this.dir, "worktrees", project.id), { signal: entry.controller.signal });
      task = this.get("task", id); task.workspace = workspace; this.store.put("task", task);
      if (entry.stop) throw new Error("Đã dừng trước khi chạy Codex.");
      const output = path.join(this.dir, run.id + ".result.json");
      const args = ["--ask-for-approval", "never", "--sandbox", "workspace-write"];
      args.push("-c", "sandbox_workspace_write.network_access=" + String(this.network));
      args.push("exec");
      if (task.sessionId) args.push("resume", task.sessionId);
      args.push("--json", "--output-schema", this.schemaFile, "--output-last-message", output);
      if (this.model) args.push("--model", this.model);
      args.push("-");
      task.status = "running"; task.updatedAt = stamp(); run.status = "running";
      this.store.transaction(() => { this.store.put("task", task); this.store.put("run", run); });
      this.log(run.id, "system", `${task.sessionId ? "Tiếp tục" : "Khởi chạy"} Codex trong ${workspace}`);
      const result = await this.launch(args, workspace, this.prompt(task, project), entry, run);
      task = this.get("task", id);
      if (entry.stop) {
        task.status = this.closing ? "interrupted" : "stopped";
        task.error = entry.timedOut ? "Đã vượt giới hạn thời gian chạy." : null;
      } else if (result.code !== 0 || result.failed || !result.completed) {
        throw new Error(result.failed || `Codex kết thúc không đầy đủ (exit ${result.code}, signal ${result.signal || "none"}).`);
      } else {
        if (fs.existsSync(output)) fs.chmodSync(output, 0o600);
        const raw = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : result.final;
        let report;
        try { report = JSON.parse(raw); } catch { throw new Error("Codex không trả báo cáo JSON hợp lệ. Xem log và tiếp tục task."); }
        if (!schema.properties.status.enum.includes(report.status) || typeof report.summary !== "string" || typeof report.question !== "string" || !Array.isArray(report.tests) || report.tests.some(t => typeof t !== "string")) {
          throw new Error("Báo cáo Codex không đúng cấu trúc yêu cầu.");
        }
        if (report.status === "needs_input" && !report.question.trim()) throw new Error("Codex yêu cầu đầu vào nhưng không đưa câu hỏi.");
        task.report = { ...report, summary: this.redact(report.summary), question: this.redact(report.question), tests: report.tests.map(t => this.redact(t)) };
        task.question = task.report.question || null;
        task.status = report.status; task.messages.push({ role: "employee", text: task.report.summary, at: stamp() });
      }
      if (!entry.stop) {
        task.diff = (await git(workspace, ["diff", "--stat"], { signal: entry.controller.signal })).slice(0, 16000);
        task.gitStatus = (await git(workspace, ["status", "--short"], { signal: entry.controller.signal })).slice(0, 16000);
      }
    } catch (e) {
      task = this.get("task", id);
      task.status = entry.stop ? (this.closing ? "interrupted" : "stopped") : "failed";
      task.error = this.redact(e.message).slice(0, 4000);
      this.log(run.id, "error", task.error);
    } finally {
      task.updatedAt = stamp(); run.status = task.status; run.endedAt = stamp(); run.error = task.error;
      this.store.transaction(() => { this.store.put("task", task); this.store.put("run", run); });
      this.log(run.id, "system", `Kết thúc lượt: ${task.status}`);
    }
  }
  launch(args, cwd, prompt, entry, run) {
    return new Promise((resolve, reject) => {
      let failed = null, completed = false, final = "";
      const child = spawn(this.codexBin, args, { cwd, shell: false, detached: process.platform !== "win32", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      entry.child = child;
      if (child.pid) { run.pid = child.pid; this.store.put("run", run); }
      const timer = setTimeout(() => { entry.timedOut = true; this.stop(run.taskId); }, this.timeoutMs);
      const dec = new StringDecoder("utf8"); let pending = "";
      const line = raw => {
        if (!raw.trim()) return;
        let e; try { e = JSON.parse(raw); } catch { this.log(run.id, "stdout", raw); return; }
        if (e.type === "thread.started" && typeof e.thread_id === "string") {
          run.sessionId = e.thread_id;
          const task = this.get("task", run.taskId); task.sessionId = e.thread_id;
          this.store.put("task", task); this.store.put("run", run);
        }
        if (e.type === "turn.completed") completed = true;
        if (e.type === "turn.failed") failed = e.error?.message || "Codex turn.failed";
        if (e.type === "item.completed" && e.item?.type === "agent_message") final = e.item.text;
        this.log(run.id, "event", JSON.stringify(e));
      };
      child.stdout.on("data", chunk => {
        pending += dec.write(chunk);
        let n; while ((n = pending.indexOf("\n")) >= 0) { line(pending.slice(0, n)); pending = pending.slice(n + 1); }
        if (pending.length > 4 * 1024 * 1024) { this.log(run.id, "error", "Dòng output quá lớn; bỏ qua phần vượt giới hạn."); pending = ""; }
      });
      const errDec = new StringDecoder("utf8");
      child.stderr.on("data", chunk => this.log(run.id, "stderr", errDec.write(chunk)));
      child.stdin.on("error", () => {});
      child.on("error", e => { failed = e.code === "ENOENT" ? "Không tìm thấy Codex CLI. Cài/đăng nhập Codex trên máy local, kiểm tra VP_CODEX_BIN." : e.message; });
      child.on("close", (code, signal) => {
        if (entry.stop && process.platform !== "win32" && child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch {}
        }
        clearTimeout(timer); clearTimeout(entry.killTimer);
        pending += dec.end(); if (pending) line(pending);
        const tail = errDec.end(); if (tail) this.log(run.id, "stderr", tail);
        run.exitCode = code; entry.child = null;
        if (code === null && !entry.stop && failed) return reject(new Error(failed));
        resolve({ code, signal, failed, completed, final });
      });
      child.stdin.end(prompt);
    });
  }
  stop(id) {
    const task = this.get("task", id), entry = this.active.get(id);
    if (!entry) {
      if (task.status !== "queued") throw new Error("Task không đang chạy hoặc chờ lượt.");
      task.status = "stopped"; task.updatedAt = stamp(); this.store.put("task", task); return task;
    }
    entry.stop = true; entry.controller.abort(); task.status = "stopping"; task.updatedAt = stamp(); this.store.put("task", task);
    const kill = signal => {
      const pid = entry.child?.pid; if (!pid) return;
      try {
        if (process.platform === "win32") execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
        else process.kill(-pid, signal);
      } catch (e) { if (e.code !== "ESRCH") console.error("stop:", e.message); }
    };
    kill("SIGTERM"); clearTimeout(entry.killTimer); entry.killTimer = setTimeout(() => kill("SIGKILL"), 3000);
    return task;
  }
  async close() {
    this.closing = true;
    for (const id of this.active.keys()) this.stop(id);
    await Promise.allSettled([...this.active.values()].map(e => e.promise));
    this.store.close();
  }
  async health() {
    return new Promise(resolve => execFile(this.codexBin, ["--version"], { timeout: 5000, windowsHide: true }, (e, out) => {
      resolve({ available: !e, version: !e ? this.redact(out.trim()) : null, message: e ? "Không gọi được Codex CLI. Kiểm tra VP_CODEX_BIN và PATH của process server." : "CLI có sẵn; xác thực được kiểm tra khi chạy task." });
    }));
  }
}
module.exports = { Office, RUNNING };
