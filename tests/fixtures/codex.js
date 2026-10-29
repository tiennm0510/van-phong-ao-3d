#!/usr/bin/env node
"use strict";
// Local process contract fixture. Never calls a model or external service.
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("codex-cli fixture"); process.exit(0); }
let prompt = "";
process.stdin.setEncoding("utf8"); process.stdin.on("data", c => { prompt += c; });
process.stdin.on("end", () => {
  fs.writeFileSync("fixture-args.json", JSON.stringify(args));
  const session = args.includes("resume") ? args[args.indexOf("resume") + 1] : crypto.randomUUID();
  const emit = e => process.stdout.write(JSON.stringify(e) + "\n");
  emit({ type: "thread.started", thread_id: session }); emit({ type: "turn.started" });
  if (prompt.includes("FIXTURE_HOLD")) {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    fs.writeFileSync("fixture-child.pid", String(child.pid));
    // Verify process-group termination without looking up namespace-local PIDs
    // in /proc (which can be mounted from a different PID namespace).
    let stopping = false, childStopped = false;
    child.on("close", () => {
      childStopped = true;
      fs.writeFileSync("fixture-child-stopped", "closed\n");
      if (stopping) process.exit(0);
    });
    process.on("SIGTERM", () => { stopping = true; if (childStopped) process.exit(0); });
    setInterval(() => emit({ type: "item.started", item: { type: "command_execution", command: "fixture waiting" } }), 200);
    return;
  }
  setTimeout(() => {
    if (prompt.includes("FIXTURE_FAIL")) { emit({ type: "turn.failed", error: { message: "Fixture deliberate failure" } }); process.exit(1); }
    const report = { status: prompt.includes("FIXTURE_ASK") && !prompt.includes("FIXTURE_ANSWER") ? "needs_input" : "review",
      summary: "Đã kiểm tra dự án thử nghiệm.", question: "", tests: ["Fixture check passed"] };
    if (report.status === "needs_input") report.question = "API trả mã lỗi nào?";
    const raw = prompt.includes("FIXTURE_BAD_JSON") ? "not json" : JSON.stringify(report);
    fs.writeFileSync("agent-output.txt", "modified by fixture\n");
    fs.writeFileSync(args[args.indexOf("--output-last-message") + 1], raw);
    // Deliberately split UTF-8 JSON output between chunks.
    const event = Buffer.from(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: raw } }) + "\n");
    process.stdout.write(event.subarray(0, 77)); process.stdout.write(event.subarray(77));
    emit({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } });
  }, prompt.includes("FIXTURE_SLOW") ? 650 : 30);
});
