# ADR 002: Unread theo membership và read marker

Trạng thái: đã triển khai.

## Bối cảnh

Client có thể chỉ tải một phần lịch sử, nhận event trùng hoặc chạy nhiều tab. Unread cần đúng cả khi user rời rồi tham gia lại nhóm; marker của peer cần cập nhật dù chưa có tin mới.

## Quyết định

- PostgreSQL COUNT tin do người khác tạo sau `last_read_seq` trong membership đang hoạt động, gồm text/system. Không lưu counter riêng và không lấy hiệu hai seq.
- PUT read khóa thread, yêu cầu `joined_seq-1 <= N <= threads.last_seq`, cập nhật bằng `GREATEST`. Tham gia lại tạo marker của membership mới.
- Client chỉ tăng marker tới tin đã render sau sync, khi thread mở, tab visible và ở cuối chat; direct còn cần giải mã thành công. Không vượt `syncedSeq`.
- Sau commit, `thread.updated` qua Redis/gateway tới reader và peer cho direct, chỉ reader cho group. Mọi tab của user đều được notification.
- Client debounce rồi gọi `GET /threads` để nhận marker/unread/peer marker do server tính. Notification không tạo message, không tăng sequence và không mang nội dung chat.

## Đánh đổi

COUNT có chi phí truy vấn nhưng tránh sai lệch counter khi retry hoặc đổi membership. Marker tăng không chứng minh người dùng đã nhìn từng tin. Notification best effort có thể mất; publish lỗi không làm PUT đã commit thất bại. Summary được đối chiếu lại khi load/reconnect, không polling theo timer.

Trình tự và điều kiện client: [read marker, unread và nhiều tab](../project-flows.md#read-marker-unread-và-nhiều-tab).
