# Hướng dẫn cho agent: cài và dùng Văn phòng ảo 3D

> **Bạn là agent AI** (Claude Code, Codex hay agent khác). Chủ của bạn đã gửi link kho này và muốn có một văn phòng ảo theo dõi đội AI, giống bản gốc của VinMKTHub. Làm lần lượt các bước dưới đây, rồi báo lại chủ bằng tiếng Việt, ngắn gọn.

## 0. Ranh giới an toàn (đọc trước)

- Chế độ legacy chỉ đọc nhật ký phiên trong `~/.claude` và `~/.codex`. Trang chính mới điều khiển Codex CLI theo task; xem phần MVP trong README. Codex dùng tài khoản/provider local đã đăng nhập; không cần thêm API key cho văn phòng.
- **Hỏi chủ trước khi** làm 4 việc sau:
  - tải hoặc cài phần mềm, ví dụ Node.js hay cloudflared;
  - sửa `AGENTS.md` / `CLAUDE.md` của dự án (bước 5);
  - mở văn phòng ra Internet (bước 7);
  - xóa dữ liệu ví dụ của người khác.
- Không in khóa xem (`accessKey`) hay mã PIN vào tệp công khai, commit hay tin nhắn nhóm. Chỉ đưa cho chủ trong cuộc trò chuyện riêng.
- Không đọc file `*.key` trong `~/.claude/sessions`. Văn phòng chỉ cần file `*.json` ở đó.

## 1. Kiểm tra máy

```bash
node -v
```

Cần bản 22.13 trở lên. Máy chưa có Node thì dừng và nhờ chủ cài bản LTS ở https://nodejs.org. Đừng tự tải nếu chủ chưa đồng ý.

Kiểm tra có nhật ký để đọc:
- Claude Code ghi ở `~/.claude/projects/`.
- Codex ghi ở `~/.codex/sessions/`.

## 2. Tải mã về (đặt ngoài thư mục dự án)

```bash
git clone https://github.com/tiennm0510/van-phong-ao-3d.git ~/van-phong-ao-3d
cd ~/van-phong-ao-3d
```

Trên Windows nên dùng một đường dẫn không có dấu, ví dụ `C:/van-phong-ao-3d`. Chạy `npm install` để cài dependency và chuẩn bị Three.js/font local, sau đó sao chép `.env.example` thành `.env` nếu chưa có. Username Git mặc định là `tiennm55`; chỉnh trong `.env` trước khi setup.

## 3. Cài đặt không hỏi

**Thư mục dự án** là nơi chủ đang cho các phiên AI làm việc, thường là thư mục bạn được mở ra. Hỏi chủ tên văn phòng và chủ muốn được gọi là gì; chủ không nói thì dùng mặc định.

```bash
node setup.js --yes --project "<đường dẫn dự án>" --title "Văn phòng <tên>" --owner "<cách gọi chủ>"
```

Lệnh này làm 3 việc:
- ghi `config.json`;
- tạo sổ điều phối `data/` từ khung mẫu `mau/`;
- tạo `data/DOAN-CHEN-VAO-AGENTS.md`, trong đó đường dẫn thật đã được điền sẵn.

Muốn theo dõi nhiều dự án thì lặp lại `--project`.

## 4. Chạy và tự kiểm

Chạy máy chủ **ở chế độ nền**, vì nó phải chạy liên tục. Claude Code dùng chế độ chạy nền của công cụ Bash. Codex thì mở tiến trình riêng.

```bash
node server.js
```

Kiểm tra máy chủ đã lên:

```bash
curl -s http://127.0.0.1:7788/state
```

Kết quả phải là JSON. Trường `agents` phải có ít nhất 2 người: chủ (`ceo`) và chính phiên của bạn. Nếu chỉ có 1 người:
- kiểm `projects` trong `config.json` có đúng thư mục dự án không, dùng dấu `/`;
- chờ 5 giây rồi hỏi lại.

Chủ mở văn phòng ở **http://localhost:7788**.

## 5. Đưa luật đội vào dự án (hỏi chủ trước)

Để mọi phiên AI tự dùng hòm thư, lượt DEV, sổ "Cần anh"… thì đoạn luật trong `data/DOAN-CHEN-VAO-AGENTS.md` phải nằm trong:
- `AGENTS.md` của dự án (Codex đọc file này);
- `CLAUDE.md` của dự án (Claude Code đọc file này).

Chủ đồng ý thì chạy:

```bash
node setup.js --yes --project "<đường dẫn dự án>" --title "…" --owner "…" --chen-luat
```

Lệnh này chỉ thêm vào cuối file và bỏ qua file đã có đoạn đó.

## 6. Điền sổ cho đúng đội thật

Sổ nằm ở `data/`. Chỉ ghi bằng công cụ `node tools/vp.js …`; riêng file Markdown thì sửa tay.

1. **Đặt tên phiên trùng tên vai.** Claude Code dùng `/rename Quản lý`; Codex đặt tên thread. Văn phòng và hòm thư nhận người theo tên này.
2. **`data/DOI-NGU.md`**: sửa bảng cho đúng các vai thật, ghi 8 ký tự đầu mã phiên ở cột "Mã phiên".
3. **Việc ưu tiên:**
   - Xóa việc ví dụ: `node tools/vp.js viec xoa 1`.
   - Thêm việc thật: `node tools/vp.js viec them --thu-tu 1 --viec "…" --de-lam-gi "…" --chu "<vai>" --han 2026-11-01T17:00`.
4. **Gói việc:**
   - `node tools/vp.js goi tao <gói>`, rồi `goi muc <gói> <MÃ> --yeu-cau "…"`.
   - Nối gói vào việc ưu tiên: `viec sua 1 --muc <gói>:<MÃ>`.
   - Gói `vi-du` chỉ là mẫu, xóa được bằng cách xóa thư mục `data/goi/vi-du`.
5. **`data/NOI-QUY.md`**: bộ luật mẫu. Sửa theo cách đội làm, hoặc xóa đi để màn Nội quy dùng `AGENTS.md` / `CLAUDE.md` của dự án.

## 7. Xem trên điện thoại (tùy chọn, hỏi chủ)

1. Tạo khóa xem:

   ```bash
   node setup.js --yes --project "…" --key "<chuỗi ngẫu nhiên>"
   ```

   Sau đó khởi động lại `server.js`.
2. Cài cloudflared, việc này cần chủ đồng ý:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - macOS: `brew install cloudflared`
3. Mở đường hầm:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/xem-tren-dien-thoai.ps1`
   - macOS / Linux: `sh scripts/xem-tren-dien-thoai.sh`
4. Gửi chủ link `https://….trycloudflare.com` và khóa xem, chỉ trong cuộc trò chuyện riêng.

## 8. Báo lại chủ

Ngắn gọn, kết luận trước. Ví dụ:

> Văn phòng đã chạy ở http://localhost:7788, đang thấy N phiên (X Claude, Y Codex). Sổ điều phối ở `<đường dẫn>/data`. Đã/chưa dán luật đội vào AGENTS.md và CLAUDE.md. Muốn xem trên điện thoại thì anh/chị cho phép cài cloudflared.

---

## Phụ lục A: Văn phòng có gì, đọc từ đâu

| Màn | Đọc từ | Ai ghi |
|---|---|---|
| Văn phòng 3D, Sơ đồ 2D | nhật ký phiên + mọi sổ dưới đây | tự động |
| Bảng điều hành (màn giữa) | nhân sự, phòng DEV, việc ưu tiên, lịch DEV, luồng tin, Cần anh, tiền AI | tự động + sổ |
| Công việc & tiến độ (màn trái) | `UU-TIEN.json`, `goi/*/viec.json`, `goi/*/tien-do.md`, `QUYET-DINH.md`, `CAN-ANH.md`, lượt DEV | Quản lý, chủ gói |
| Nội quy & đội ngũ (màn phải) | `NOI-QUY.md` (hoặc AGENTS.md/CLAUDE.md dự án), `DOI-NGU.md`, `CAP-BAC.md`, `BAI-HOC.md`, `VIEC-LAM-SAU.md`, `TU-DIEN.md`, `spec/*.md` | Quản lý |
| Tổng quan | việc ưu tiên + gói + bot nào đang làm gì, ai rảnh mà còn việc, ai im quá 2 giờ | tự động + sổ |
| Hòm thư | `hop-thu/<vai>.jsonl` | `vp gui / tiep / xong` |
| Đánh giá nhân sự | token, việc xong, lỗi lệnh, lượt DEV → điểm A/B/C/D | tự động |
| Tin nhắn | tin giữa các phiên (SendMessage, PEER MESSAGE) + việc chủ giao | tự động |
| Cần anh | `CAN-ANH.md` + hộp hỏi đang mở trong phiên Claude + tin gắn `[CẦN ANH]` | `vp cananh` |
| Tiền AI | token × giá trong `config.json` (`prices`) + tiền lượt DEV tự khai | tự động + `vp luot nha --usd` |
| Phòng DEV | `DEV.lock`, `DEV-LUOT.jsonl`; container Docker nếu đặt `dockerFilter` | `vp luot` |
| Nhắn tin cho agent | chủ gõ trên văn phòng → `hop-thu/<vai>.jsonl` (từ xa cần PIN) | agent đọc bằng `vp tiep` |

## Phụ lục B: Lệnh `vp` (gõ `node tools/vp.js giup` để xem đủ)

| Việc | Lệnh |
|---|---|
| Đọc tin cuối mỗi lượt | `vp tiep --toi "<vai mình>"` |
| Đóng tin | `vp xong <mã> --ghi-chu "kết quả"` |
| Giao việc | `vp gui --toi "<vai>" --tu "<vai mình>" "[VIỆC] …"` |
| Hỏi chủ | `vp cananh hoi --tu "<vai>" "…" --lua-chon "a / b"` · đóng: `vp cananh xong CA-n "…"` |
| Lượt DEV | `vp luot cho|lay --goi <gói> --vai "<vai>"` · `vp luot nha --vai "<vai>" --ket-qua dat|hong [--usd 0.3]` · `vp luot xem` |
| Việc ưu tiên | `vp viec ds|them|sua|dung|xoa` |
| Gói việc | `vp goi tao|muc|dat|sua|ghichu` |
| Tiến độ | `vp tiendo <gói> "…"` · đang dở: `--dang-do --vai "<vai>"` |
| Bài học | `vp baihoc --the "<thẻ>" "…" --chan "cái chặn"` |

## Phụ lục C: Văn phòng nhận người thế nào

- **Ai là nhân viên:** mọi phiên Claude Code hoặc Codex có thư mục làm việc nằm trong `projects` (tính cả thư mục con, worktree) và hoạt động trong `keepHours` giờ (mặc định 24).
- **Tên:** lấy theo tên phiên. **Phòng:** tự xếp theo chữ trong tên:
  - quản lý / manager / lead → Phòng Quản lý;
  - điều phối / trợ lý / coordinator → Phòng Điều phối;
  - review / duyệt / kiểm tra / test / QA → Kiểm tra & duyệt;
  - còn lại: Studio Claude hoặc Khu Codex.
- Đổi phòng hay chức danh bằng `staff` trong `config.json`. Giấu phiên bằng `hide`.
- **Tin bay giữa bàn:** phiên Claude gửi bằng SendMessage; Codex nhận qua `[PEER MESSAGE]`. Chủ gõ vào phiên nào thì hiện là "Giám đốc nói" với phiên đó.
- **Bị chặn (đỏ):** câu trả lời mới nhất có `[CHẶN]` hoặc "bị chặn". **Chờ DEV (vàng):** đang trong hàng chờ `vp luot cho`.
