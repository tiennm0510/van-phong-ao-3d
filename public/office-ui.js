const $ = id => document.getElementById(id);
const el = (tag, cls, content) => {
  const node = document.createElement(tag); if (cls) node.className = cls; if (content != null) node.textContent = content; return node;
};
const ACTIVE = ["preparing", "running", "stopping"];
const WAITING = ["awaiting_id", "needs_input", "blocked", "failed", "interrupted", "review"];
const labels = { awaiting_id: "Chờ xác nhận ID", queued: "Chờ lượt", preparing: "Chuẩn bị worktree", running: "Đang làm", stopping: "Đang dừng", stopped: "Đã dừng", review: "Chờ bạn review", needs_input: "Cần trả lời", blocked: "Bị chặn", failed: "Lỗi", interrupted: "Bị gián đoạn" };
const date = value => value ? new Date(value).toLocaleString("vi-VN", { hour12: false }) : "";
let state = { projects: [], employees: [], tasks: [], runs: [], settings: {} };
let projectId = null, taskId = null, runId = null, logOffset = 0, logBusy = false, scene = null;
let lastStateAt = 0, toastTimer, pollBusy = false;

async function api(url, { method = "GET", data } = {}) {
  const response = await fetch("/api/office/" + url, { method, cache: "no-store", headers: { "Content-Type": "application/json", "X-Office-Client": "local-ui" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await response.json().catch(() => ({ error: "Không đọc được phản hồi server." }));
  if (!response.ok) throw new Error(body.error || "Không thực hiện được yêu cầu.");
  return body;
}
function toast(message) { $("toast").textContent = message; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000); }
function badge(status) { return el("span", "badge " + (ACTIVE.includes(status) ? "working" : ["failed", "blocked"].includes(status) ? "error" : WAITING.includes(status) ? "waiting" : ""), labels[status] || status); }
function selectProject(id) { projectId = id; render(); }
function render() {
  if (!state.projects.some(p => p.id === projectId)) projectId = state.projects[0]?.id || null;
  $("project-count").textContent = state.projects.length;
  $("working-count").textContent = state.tasks.filter(t => ACTIVE.includes(t.status)).length;
  $("waiting-count").textContent = state.tasks.filter(t => WAITING.includes(t.status)).length;
  $("settings").textContent = `${state.settings.managerUsername || "tiennm55"} · Tối đa ${state.settings.maxConcurrent || 2} project chạy`;
  $("project-list").replaceChildren();
  if (!state.projects.length) $("project-list").append(el("p", "help", "Chưa có phòng làm việc."));
  for (const project of state.projects) {
    const employee = state.employees.find(e => e.projectId === project.id);
    const button = el("button", "project-button" + (project.id === projectId ? " selected" : ""));
    const copy = el("div"); copy.append(el("strong", "", project.name), el("small", "", employee?.name || "Chưa có nhân viên"));
    button.append(el("span", "project-symbol", project.name.slice(0, 1).toUpperCase()), copy); button.onclick = () => selectProject(project.id); $("project-list").append(button);
  }
  $("empty-scene").hidden = !!state.projects.length;
  const project = state.projects.find(p => p.id === projectId), employee = state.employees.find(e => e.projectId === projectId);
  $("project-detail").hidden = !project;
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  if (project) {
    $("project-name").textContent = project.name; $("project-path").textContent = project.path;
    $("employee-name").textContent = employee?.name || "Nhân viên";
    const active = tasks.find(t => ACTIVE.includes(t.status));
    $("employee-status").textContent = active ? labels[active.status] : tasks.some(t => WAITING.includes(t.status)) ? "Có công việc cần bạn" : "Sẵn sàng nhận việc";
  }
  $("task-count").textContent = tasks.length;
  $("task-subtitle").textContent = project ? `${project.name} · Một task chạy tại một thời điểm` : "Chọn một phòng để xem công việc";
  $("task-list").replaceChildren();
  if (!tasks.length) $("task-list").append(el("div", "empty-tasks", project ? "Phòng đã sẵn sàng. Giao việc đầu tiên cho nhân viên." : "Chưa có công việc. Thêm project để bắt đầu."));
  for (const task of [...tasks].reverse()) {
    const row = el("button", "task-row"), copy = el("div");
    copy.append(el("strong", "", task.title), el("small", "", task.question || (task.report?.summary?.slice(0, 110)) || date(task.updatedAt)));
    row.append(el("span", "task-code mono", task.taskId || "Chưa có ID"), copy, badge(task.status));
    row.onclick = () => openTask(task.id); $("task-list").append(row);
  }
  scene?.update(state, projectId);
  if ($("task-dialog").open) renderTask();
}
async function refresh() { state = await api("state"); lastStateAt = Date.now(); render(); }
function openTask(id) {
  if (taskId !== id) { runId = null; logOffset = 0; $("run-log").textContent = ""; $("confirm-form").reset(); $("continue-form").reset(); }
  taskId = id;
  renderTask(); if (!$("task-dialog").open) $("task-dialog").showModal();
  loadLogs().catch(e => toast(e.message));
}
function renderTask() {
  const task = state.tasks.find(t => t.id === taskId); if (!task) return;
  $("task-id-label").textContent = task.taskId || "NHÂN VIÊN ĐANG CHỜ TASK ID";
  $("task-title").textContent = task.title; $("task-request").textContent = task.request;
  $("task-meta").replaceChildren(badge(task.status), el("small", "", "Cập nhật " + date(task.updatedAt)));
  $("task-error").hidden = !task.error; $("task-error").textContent = task.error || "";
  $("confirm-form").hidden = task.status !== "awaiting_id"; $("confirm-question").textContent = task.question || "";
  $("stop-task").hidden = ![...ACTIVE, "queued"].includes(task.status); $("stop-task").disabled = task.status === "stopping";
  $("continue-form").hidden = ["awaiting_id", "queued", ...ACTIVE].includes(task.status);
  const report = $("task-report"); report.hidden = !task.report && !task.question;
  report.replaceChildren();
  if (task.question && task.status !== "awaiting_id") report.append(el("h3", "", "Nhân viên cần bạn"), el("p", "", task.question));
  if (task.report) {
    report.append(el("h3", "", "Báo cáo công việc"), el("p", "", task.report.summary));
    const tests = el("ul"); for (const t of task.report.tests) tests.append(el("li", "", t)); report.append(tests);
  }
  if (task.gitStatus || task.diff) report.append(el("h3", "", "Thay đổi trong worktree"), el("pre", "", task.gitStatus || task.diff));
  $("task-branches").hidden = !task.branch;
  $("task-branches").textContent = task.branch ? `Worktree: ${task.workspace || "Chưa tạo"}\nNhánh: ${task.branch}\n${task.mergeRequests.map(m => `${m.source} → ${m.target}: ${m.url || "chưa tạo MR"}`).join("\n")}\nBước hiện tại bàn giao diff để review. Chưa tự commit, push hoặc tạo MR.` : "";
  const runs = state.runs.filter(r => r.taskId === taskId);
  if (!runs.some(r => r.id === runId) || (runs.length && !["review", "stopped", "failed", "interrupted", "needs_input", "blocked"].includes(task.status) && runId !== runs.at(-1).id)) setRun(runs.at(-1)?.id || null);
  $("runs").replaceChildren();
  runs.forEach((run, index) => { const b = el("button", run.id === runId ? "selected" : "", `Lượt ${index + 1} · ${labels[run.status] || run.status}`); b.type = "button"; b.onclick = () => { setRun(run.id); renderTask(); loadLogs().catch(e => toast(e.message)); }; $("runs").append(b); });
  $("run-details").hidden = !runs.length;
}
function setRun(id) { if (id !== runId) { runId = id; logOffset = 0; $("run-log").textContent = ""; } }
async function loadLogs() {
  if (!runId || logBusy || !$("task-dialog").open) return;
  const current = runId, offset = logOffset; logBusy = true;
  try {
    const result = await api(`runs/${current}/logs?after=${offset}`);
    if (current !== runId || offset !== logOffset) return;
    const pre = $("run-log"), stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 65;
    pre.textContent += result.rows.map(row => {
      let content = row.text;
      if (row.kind === "event") {
        try {
          const e = JSON.parse(row.text);
          content = e.item?.command || e.item?.text || e.error?.message || e.type;
          if (e.item?.aggregated_output) content += "\n" + e.item.aggregated_output;
        } catch {}
      }
      return `[${new Date(row.at).toLocaleTimeString("vi-VN", { hour12: false })}] ${content}`;
    }).join("\n") + (result.rows.length ? "\n" : "");
    // Bound the browser buffer. Full log history remains on disk.
    if (pre.textContent.length > 300000) pre.textContent = "… Các dòng trước được lưu trong lịch sử trên máy.\n" + pre.textContent.slice(-200000);
    logOffset = result.next; if (stick) pre.scrollTop = pre.scrollHeight;
  } finally { logBusy = false; }
}
function bind(formId, action) {
  const form = $(formId); form.addEventListener("submit", async e => {
    e.preventDefault(); const button = form.querySelector('button.primary'); button.disabled = true; form.querySelector(".form-error").textContent = "";
    try { await action(Object.fromEntries(new FormData(form)), form); }
    catch (error) { form.querySelector(".form-error").textContent = error.message; }
    finally { button.disabled = false; }
  });
}
document.querySelectorAll("[data-close]").forEach(b => { b.onclick = () => b.closest("dialog").close(); });
function addProject() { $("project-form").reset(); $("project-form").elements.featureBase.value = state.settings.featureBase || "master"; $("project-form").querySelector(".form-error").textContent = ""; $("project-dialog").showModal(); }
$("add-project").onclick = addProject; $("empty-add").onclick = addProject;
$("reset-camera").onclick = () => scene?.reset();
$("new-task").onclick = () => { $("create-form").reset(); $("create-form").querySelector(".form-error").textContent = ""; $("create-dialog").showModal(); };
$("rename").onclick = () => { $("rename-form").elements.name.value = state.employees.find(e => e.projectId === projectId)?.name || ""; $("rename-form").querySelector(".form-error").textContent = ""; $("rename-dialog").showModal(); };
bind("project-form", async (data, form) => { const result = await api("projects", { method: "POST", data }); projectId = result.project.id; form.closest("dialog").close(); await refresh(); toast("Phòng và nhân viên đã sẵn sàng."); });
bind("rename-form", async (data, form) => { const employee = state.employees.find(e => e.projectId === projectId); await api("employees/" + employee.id, { method: "PATCH", data }); form.closest("dialog").close(); await refresh(); });
bind("create-form", async (data, form) => { const task = await api(`projects/${projectId}/tasks`, { method: "POST", data }); form.closest("dialog").close(); await refresh(); openTask(task.id); });
bind("confirm-form", async data => { await api(`tasks/${taskId}/confirm`, { method: "POST", data: { taskId: data.taskId, confirmed: data.confirmed === "on" } }); await refresh(); toast("Đã xác nhận ID. Task được xếp hàng chạy."); });
bind("continue-form", async (data, form) => { await api(`tasks/${taskId}/continue`, { method: "POST", data }); form.reset(); await refresh(); });
$("stop-task").onclick = async () => { try { await api(`tasks/${taskId}/stop`, { method: "POST", data: {} }); await refresh(); } catch (e) { toast(e.message); } };
$("health").onclick = async () => { $("health").disabled = true; try { const health = await api("health"); toast(health.available ? health.version + " · " + health.message : health.message); } catch (e) { toast(e.message); } finally { $("health").disabled = false; } };

// Load 3D separately so a WebGL/module failure never breaks task controls.
import("./office-scene.js").then(({ createOfficeScene }) => { scene = createOfficeScene($("scene"), selectProject); scene.update(state, projectId); }).catch(e => { $("scene-fallback").hidden = false; console.warn("3D unavailable:", e.message); });
const stream = new EventSource("/api/office/events");
stream.onmessage = e => {
  try { state = JSON.parse(e.data); lastStateAt = Date.now(); $("connection").textContent = "Đang kết nối trực tiếp"; $("connection-dot").classList.remove("off"); render(); }
  catch (error) { console.error(error); }
};
stream.onerror = () => { $("connection").textContent = "Đang kết nối lại"; $("connection-dot").classList.add("off"); };
refresh().catch(e => toast(e.message));
setInterval(async () => {
  if (pollBusy) return; pollBusy = true;
  try { if (Date.now() - lastStateAt > 4000) await refresh(); await loadLogs(); } catch (e) { $("connection").textContent = e.message; $("connection-dot").classList.add("off"); }
  finally { pollBusy = false; }
}, 1000);
