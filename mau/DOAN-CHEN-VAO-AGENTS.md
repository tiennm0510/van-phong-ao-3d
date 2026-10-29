<!-- Đoạn này dán vào cuối AGENTS.md (Codex) và CLAUDE.md (Claude Code) của DỰ ÁN, để mọi phiên AI làm theo cùng một cách và văn phòng ảo hiện đúng. -->
## Văn phòng ảo và sổ điều phối của đội

Đội làm việc trong một văn phòng ảo; chủ văn phòng xem ở http://localhost:{{PORT}}. Mọi sổ của đội nằm ở `{{DATA}}` và chỉ ghi bằng công cụ:

```
node "{{VP}}" <lệnh>        (xem đủ lệnh: node "{{VP}}" giup)
```

- **Đọc trước khi làm:** nội quy `{{DATA}}/NOI-QUY.md`, đội ngũ `{{DATA}}/DOI-NGU.md`, việc ưu tiên `node "{{VP}}" viec ds`.
- **Tên phiên = tên vai** trong DOI-NGU.md (Claude Code: `/rename <vai>`; Codex: đặt tên thread). Văn phòng và hòm thư nhận người theo tên này.
- **Cuối mỗi lượt:** `node "{{VP}}" tiep --toi "<vai của mình>"`. Còn tin thì làm, xong chạy `node "{{VP}}" xong <mã> --ghi-chu "<kết quả 1 dòng>"` rồi `tiep` lại; hết tin mới dừng. Tin trùng hay hết hiệu lực cũng đóng bằng `xong`.
- **Giao việc cho người khác:** `node "{{VP}}" gui --toi "<vai>" --tu "<vai mình>" "[VIỆC] …"`. Không gửi tin chỉ để báo.
- **Cần chủ văn phòng quyết** (production, tiền, khóa mới, xóa dữ liệu, đổi luật): `node "{{VP}}" cananh hoi --tu "<vai mình>" "…" --lua-chon "a / b"`. Việc khác trong quyền thì tự quyết.
- **Lên DEV:** `node "{{VP}}" luot cho|lay|nha …`. Mỗi lúc một người giữ lượt, xong phải nhả kèm kết quả (`--ket-qua dat|hong`, có tiền AI thì `--usd`).
- **Gói việc và tiến độ:** `node "{{VP}}" goi dat|sua|ghichu …`, `node "{{VP}}" tiendo <gói> "…"`. Trước khi nghỉ hoặc bị nén ngữ cảnh: `node "{{VP}}" tiendo <gói> "…" --dang-do --vai "<vai>"`.
- **Bị chặn:** ghi `[CHẶN]` ở câu trả lời (văn phòng tô đỏ) và giao người gỡ được.
- **Bài học:** lỗi mới mất ≥ 20 phút thì `node "{{VP}}" baihoc --the "<thẻ>" "…" --chan "cái chặn tự động"`.

## Git — quy trình của nhân viên dự án

- Mỗi khi được giao task mới, **luôn hỏi lại quản lý để xác nhận task ID**, kể cả khi nội dung đã nhắc đến ID. Trước khi nhận câu trả lời, chỉ được đọc và làm rõ yêu cầu; chưa sửa code, tạo nhánh, commit hoặc push. Lưu task ID đã xác nhận vào tiến độ; sửa tiếp cùng task không hỏi lại, đổi ID phải xác nhận lại.
- Username Git của quản lý: `{{MANAGER_USERNAME}}`. Đây không phải tên hiển thị nhân viên. Không tự lấy username từ tên nhân viên hay `git config user.name`.
- Kiểm tra task ID và toàn bộ tên nhánh bằng `git check-ref-format --branch`; ID phải là một thành phần, không có dấu `/`, khoảng trắng hay ký tự điều khiển. Không tự sửa ID sai; hỏi lại quản lý. Không ghép input vào lệnh shell; truyền từng đối số.
- Fetch remote trước khi lập nhánh. Nhánh cá nhân là `<username-quản-lý>/<task-id>`; feature là `feature/<task-id>`. Nếu feature đã có ở remote thì dùng nhánh đó làm gốc; nếu chưa có, tạo từ nhánh remote `{{FEATURE_BASE}}`. Nếu thiếu nhánh gốc thì báo chặn, không tự thay nhánh khác.
- Tạo nhánh cá nhân từ feature và làm việc trong worktree riêng. Nếu nhánh/worktree đã tồn tại thì kiểm tra đúng task và tiếp tục an toàn; không reset, force push hoặc ghi đè thay đổi có sẵn.
- Khi hoàn thành code và kiểm tra phù hợp, commit/push và tạo **đủ ba MR** (GitHub gọi là PR):
  1. `<username-quản-lý>/<task-id>` → `feature/<task-id>`.
  2. `feature/<task-id>` → `master`.
  3. `feature/<task-id>` → `testing`.
- Tìm MR đang mở theo repository, source và target trước khi tạo để tránh trùng. Giữ feature sau khi merge MR cá nhân; hai MR từ feature phải tắt xóa source branch tự động.
- Hai MR từ feature là Draft/chờ quản lý duyệt. Nếu feature chưa có diff và nền tảng không cho tạo MR rỗng, ghi rõ đang chờ MR cá nhân được merge; kiểm tra và tạo bổ sung khi có diff. Không tạo commit giả để lách giới hạn. Chưa có đủ ba MR thì báo trạng thái **chờ hoàn thiện MR**, không báo hoàn tất toàn bộ quy trình.
- Không tự merge bất kỳ MR nào, không push trực tiếp vào `master`/`testing`. Không tự tạo các nhánh đích bị thiếu. Thiếu quyền, xác thực, nhánh đích hoặc gặp xung đột thì báo quản lý.
- Báo cáo gồm task ID, nhánh, kết quả kiểm tra và URL/trạng thái của cả ba MR. Việc đọc nhận xét từ nền tảng và tạo MR tự động cần bộ thực thi; mẫu rule này là hướng dẫn cho agent, không phải daemon tự chạy.
