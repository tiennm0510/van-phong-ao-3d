// Đọc config.json + giá trị mặc định. Dùng chung cho máy chủ (server.js) và công cụ của đội (tools/vp.js).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

function gitPolicy() {
  const managerUsername = process.env.VP_MANAGER_USERNAME || "tiennm55";
  const featureBase = process.env.VP_FEATURE_BASE || "master";
  const valid = (s) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes("..") && !s.endsWith(".") && !s.endsWith(".lock");
  if (!valid(managerUsername) || !valid(featureBase)) throw new Error("VP_MANAGER_USERNAME và VP_FEATURE_BASE phải là tên Git đơn, hợp lệ.");
  return { managerUsername, featureBase };
}

const DEFAULTS = {
  title: "Văn phòng AI", subtitle: "Công ty AI · trực tiếp", ownerName: "Giám đốc",
  port: 7788, host: "127.0.0.1", projects: [], staff: [], hide: [], keepHours: 24, accessKey: "",
  claudeDir: path.join(os.homedir(), ".claude"), codexDir: path.join(os.homedir(), ".codex"),
  dataDir: "data",          // sổ điều phối của đội (việc, gói, hòm thư, lượt DEV, cần anh, nội quy…)
  rulesFile: "",            // nội quy hiện trên màn "Nội quy": để trống = data/NOI-QUY.md, không có thì AGENTS.md / CLAUDE.md của dự án đầu tiên
  aiCapUsd: 100,            // trần tiền AI mỗi ngày (USD) để tô vàng/đỏ ô "Tiền AI hôm nay"
  // Giá API (USD cho 1 triệu token) để ước tính tiền AI từ token đếm được. Gói thuê bao tháng thì số này chỉ để so sánh.
  prices: { claude: { input: 3, cacheRead: 0.3, output: 15 }, codex: { input: 1.25, cacheRead: 0.125, output: 10 } },
  dockerFilter: "",         // ví dụ "name=myapp-dev": hiện các container này trong Phòng DEV (để trống = không dùng Docker)
  dockerStrip: "",          // phần đầu tên container bỏ đi khi hiện, ví dụ "myapp-dev-"
  dockerRetired: [],        // container đã cho nghỉ: dừng thì không báo lỗi
};

function loadConfig(root) {
  const f = path.join(root, "config.json");
  if (!fs.existsSync(f)) return null;
  const user = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
  const cfg = { ...DEFAULTS, ...user, prices: { ...DEFAULTS.prices, ...(user.prices || {}) } };
  cfg.gitPolicy = gitPolicy();
  const integer = (name, fallback, min, max) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} phải nằm trong khoảng ${min}–${max}.`);
    return value;
  };
  cfg.runner = {
    codexBin: process.env.VP_CODEX_BIN || "codex",
    model: process.env.VP_CODEX_MODEL || "",
    maxConcurrent: integer("VP_MAX_CONCURRENT", 2, 1, 8),
    timeoutMs: integer("VP_RUN_TIMEOUT_MINUTES", 60, 1, 1440) * 60000,
    network: process.env.VP_CODEX_NETWORK === "1",
  };
  cfg.dataDir = path.resolve(root, cfg.dataDir || "data");
  return cfg;
}

module.exports = { loadConfig, DEFAULTS, gitPolicy };
