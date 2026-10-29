"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const dest = path.join(root, "public", "vendor");
fs.mkdirSync(dest, { recursive: true });
// Chỉ sao chép tài nguyên trình duyệt và giấy phép, không expose node_modules.
for (const [pkg, entries] of [
  ["three", ["build/three.module.js", "examples/jsm", "LICENSE"]],
  ["@fontsource/be-vietnam-pro", ["400.css", "500.css", "600.css", "700.css", "800.css", "files", "LICENSE"]],
  ["@fontsource/jetbrains-mono", ["400.css", "500.css", "600.css", "700.css", "files", "LICENSE"]],
]) {
  for (const entry of entries) {
    const target = path.join(dest, pkg, entry);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, "node_modules", pkg, entry), target, { recursive: true });
  }
}
console.log("Đã chuẩn bị Three.js và font tại public/vendor.");
