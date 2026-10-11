# ADR 003: Thứ tự tin theo sequence của thread

Trạng thái: đã triển khai.

## Bối cảnh

Gửi đồng thời, thay đổi thành viên và event đến khác thứ tự khiến timestamp không đủ để sắp lịch sử. Lỗi mạng sau commit còn đòi hỏi retry không tạo tin mới.

## Quyết định

- Khóa thread, kiểm tra lại membership, tăng `last_seq` và insert trong cùng transaction. Text/system dùng chung sequence.
- UUID message là khóa retry. Cùng UUID và payload hợp lệ trả lại message/seq cũ; UUID với payload khác trả `409`.
- REST trả `seq DESC` với `before_seq/next_cursor`; client gộp UUID/seq và hiển thị `seq ASC`.
- Reconnect/gap lấy từ trang mới nhất tới baseline đã sync hoặc hết cursor. Không có `after_seq`; khoảng user vắng nhóm không được mở rộng quyền chỉ để lấp seq.

## Đánh đổi

Ghi trong một thread tuần tự; không có thứ tự toàn cục giữa các thread. Lấy bù đọc lại một phần cache. Retry sau publish message lỗi có thể tạo event trùng nhưng không tăng seq. Client phải giữ đúng body khi kết quả chưa rõ; tin đã bị từ chối `400/413` ở nhóm được giải phóng để người dùng sửa.

Chi tiết: [chat nhóm realtime](../project-flows.md#chat-nhóm-realtime), [lịch sử](../project-flows.md#lịch-sử-cache-và-reconnect), [retry và pending](../project-flows.md#retry-pending-và-dữ-liệu-client).
