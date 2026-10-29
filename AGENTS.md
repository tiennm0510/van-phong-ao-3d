# Dành cho agent AI

Nếu chủ của bạn gửi link kho này để cài văn phòng ảo: đọc và làm theo **HUONG-DAN-CHO-AGENT.md** (cài, kiểm, điền sổ, báo lại chủ).
Nếu bạn được giao sửa mã văn phòng: phần legacy trong `server.js` đọc nhật ký phiên; bộ điều khiển mới ở `lib/office*.js` quản lý project/task, SQLite và process Codex. Giao diện chính là `public/office.html`, giao diện legacy là `public/index.html`. Công cụ sổ legacy là `tools/vp.js`. Cho phép dùng dependency npm phục vụ tại local. Không tự gửi dữ liệu dự án ra ngoài ngoài luồng Codex CLI/provider đã được người dùng cấu hình. Rule Git trong mẫu hướng dẫn áp dụng cho nhân viên xử lý task dự án, không tự động áp dụng cho agent bảo trì văn phòng.
