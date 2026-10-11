# ADR 005: Phiên E2EE cố định, khôi phục trên nhiều thiết bị

Ngày: 09/10/2026. Trạng thái: đã triển khai. Thay thế [ADR 004](004-e2ee-without-double-ratchet.md).

## Bối cảnh

Khóa chỉ trên một thiết bị không cho đọc lịch sử khi đổi máy hoặc đóng phiên ẩn danh. X3DH từng tin và một tab sở hữu state không đáp ứng một mật khẩu, nhiều thiết bị và ít trạng thái mutable.

## Quyết định

- Mỗi direct mới khởi tạo X3DH một lần; mọi thiết bị/hai chiều dùng cùng SK. HKDF dẫn xuất khóa từng tin theo context; không dùng Double Ratchet hoặc rekey.
- Client dẫn xuất credential/vault key riêng từ mật khẩu; backend bcrypt credential, không nhận mật khẩu gốc hoặc vault key. Vault tài khoản mã hóa chứa bộ private keys gốc và bất biến.
- Public OPK claim bị xóa khỏi hàng đợi; private OPK vẫn trong vault để recipient phục hồi cả phiên chưa từng mở. Khi hết public OPK, direct mới dùng X3DH không có OPK.
- Sender lưu bootstrap và backup SK mã hóa trong transaction khởi tạo. Recipient thiếu backup tính SK từ vault, xác minh confirmation rồi lưu/mở backup canonical trước khi dùng phiên. Mỗi user chỉ đọc backup riêng; bản ghi đầu bất biến.
- Thread lock chọn phiên đầu tiên. Đề xuất khác nhận `409` và khôi phục phiên canonical; đăng nhập/reload/reconnect không đổi phiên. Epoch ID, schema và API đọc giữ các bản đã có để giải mã lịch sử tương thích.
- Các thiết bị hoạt động độc lập, realtime bao gồm sender. Không cần state độc quyền của tab để phục hồi. Direct dùng `e2ee_v2`; group plaintext. Chưa có đổi mật khẩu.

## Đánh đổi

Vault và archive SK/private prekeys mã hóa giúp phục hồi lịch sử, đồng thời giảm bảo vệ từ việc xóa khóa. Lộ khóa tài khoản/backup có thể lộ lịch sử; không có cơ chế phục hồi sau xâm nhập của Double Ratchet. Quên mật khẩu và không còn khóa đã mở thì không có đường phục hồi.

Thiết kế giả định vault/epoch còn trên server, HTTPS/WSS và frontend đáng tin cậy. UI chưa có công cụ xác minh fingerprint; pin peer trong RAM không thay thế xác minh ngoài kênh. Đây là profile dự án, chưa được audit và không tuyên bố tương thích đầy đủ Signal.

Thông số KDF, payload, trình tự và nơi lưu dữ liệu: [E2EE hiện tại](../project-flows.md#e2ee-phiên-cố-định-và-khôi-phục), [dữ liệu client](../project-flows.md#retry-pending-và-dữ-liệu-client). Quan hệ và ràng buộc: [ERD](../chat-api-erd.md).

Nguồn tham khảo thiết kế: [X3DH](https://signal.org/docs/specifications/x3dh/), [HKDF RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html), [Argon2 RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html).
