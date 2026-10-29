"use strict";
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw new Error("Cần Content-Type application/json.");
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64000) throw new Error("Nội dung yêu cầu vượt quá giới hạn.");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Nội dung phải là một JSON object.");
  return parsed;
}
// A localhost control endpoint can execute processes. Require a loopback peer,
// same-origin requests and the explicit header, even when the legacy viewer is public.
function authorize(req) {
  const ip = req.socket.remoteAddress || "";
  if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip) || req.headers["cf-ray"] || req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) {
    return "Điều khiển nhân viên chỉ khả dụng trên máy local.";
  }
  const host = String(req.headers.host || "");
  try {
    const url = new URL("http://" + host);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return "Host điều khiển không hợp lệ. Dùng localhost hoặc 127.0.0.1.";
    if (req.headers.origin && new URL(req.headers.origin).host !== host) return "Request phải đến từ cùng văn phòng local.";
  } catch { return "Origin hoặc Host không hợp lệ."; }
  if (req.headers["sec-fetch-site"] === "cross-site") return "Không chấp nhận request khác website.";
  if (req.method !== "GET" && req.headers["x-office-client"] !== "local-ui") return "Thiếu header điều khiển local.";
  return null;
}
async function handle(req, res, url, office, clients) {
  const denied = authorize(req);
  if (denied) return send(res, 403, { error: denied });
  try {
    if (req.method === "GET" && url.pathname === "/api/office/state") return send(res, 200, office.view());
    if (req.method === "GET" && url.pathname === "/api/office/health") return send(res, 200, await office.health());
    if (req.method === "GET" && url.pathname === "/api/office/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("data: " + JSON.stringify(office.view()) + "\n\n");
      clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    let m;
    if (req.method === "GET" && (m = url.pathname.match(/^\/api\/office\/runs\/([a-f0-9-]+)\/logs$/))) {
      return send(res, 200, office.logs(m[1], Number(url.searchParams.get("after") || 0)));
    }
    if (req.method === "POST" && url.pathname === "/api/office/projects") return send(res, 201, await office.addProject(await body(req)));
    if (req.method === "PATCH" && (m = url.pathname.match(/^\/api\/office\/employees\/([a-f0-9-]+)$/))) return send(res, 200, office.renameEmployee(m[1], await body(req)));
    if (req.method === "POST" && (m = url.pathname.match(/^\/api\/office\/projects\/([a-f0-9-]+)\/tasks$/))) return send(res, 201, office.createTask(m[1], await body(req)));
    if (req.method === "POST" && (m = url.pathname.match(/^\/api\/office\/tasks\/([a-f0-9-]+)\/(confirm|continue|stop)$/))) {
      const input = await body(req);
      const value = m[2] === "confirm" ? office.confirmTask(m[1], input) : m[2] === "continue" ? office.continueTask(m[1], input) : office.stop(m[1]);
      return send(res, 200, value);
    }
    return send(res, 404, { error: "Không có API này." });
  } catch (e) { return send(res, 400, { error: office.redact(e.message) }); }
}
module.exports = { handle, authorize };
