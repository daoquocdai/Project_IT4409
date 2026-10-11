# ADR 004: E2EE từng tin — ghi chú lịch sử

Ngày quyết định cũ: 04/10/2026. **Trạng thái: đã được thay thế bởi [ADR 005](005-recoverable-e2ee-sessions.md) ngày 09/10/2026.** Nội dung này không mô tả runtime hiện tại.

## Bối cảnh

Thiết kế đầu cần gửi tới recipient offline và đọc lại ciphertext, khi chưa có vault/backup khóa phục hồi trên server.

## Quyết định cũ

Mỗi tin claim bundle và chạy X3DH riêng, không dùng Double Ratchet. Message key/pending nằm trong IndexedDB; state gắn thiết bị/tab, private OPK được tiêu thụ sau khi nhận, public OPK có luồng bổ sung.

## Lý do thay thế và đánh đổi

X3DH mỗi tin tăng request, tiêu thụ OPK; state cục bộ không đáp ứng khôi phục bằng một mật khẩu và nhiều thiết bị đồng thời. ADR 005 chuyển sang phiên cố định cho mỗi direct với vault/backup mã hóa trên server, đổi khả năng phục hồi lịch sử lấy việc giữ archive khóa.

Không áp dụng hướng dẫn vận hành của thiết kế cũ. Trình tự đang chạy: [E2EE và khôi phục](../project-flows.md#e2ee-phiên-cố-định-và-khôi-phục).
