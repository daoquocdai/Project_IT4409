# ADR 001: Tách API, gateway và Redis Streams

Trạng thái: đã triển khai.

## Bối cảnh

HTTP API xử lý transaction ngắn, WebSocket giữ kết nối dài hạn. Hai tiến trình cần trách nhiệm và vòng đời riêng; PostgreSQL giữ lịch sử để client lấy bù khi realtime bị gián đoạn.

## Quyết định

- API kết nối PostgreSQL/Redis; gateway chỉ dùng Redis, ticket/JWT và Hub, không truy vấn database.
- Sau commit, API ghi cùng Redis Stream hai event: `message.created` mang snapshot thành viên tại message seq (gồm sender), `thread.updated` yêu cầu các kết nối tải lại summary sau read marker.
- Gateway gửi tới mọi socket của recipient, dùng một instance, group `ws-gateway` và consumer cố định `gateway-1`. Đọc pending `0` trước entry mới `>`, rồi `XACK` sau xử lý/queue; recipient offline vẫn ACK.
- Queue socket có giới hạn; kết nối chậm bị đóng. Client gộp UUID và lấy bù REST khi reconnect/gap.

## Đánh đổi

DB commit và XADD không nguyên tử; chưa có transactional outbox. Publish message lỗi trả `503` dù tin đã lưu; retry cùng UUID có thể phát event trùng. Publish read notification là best effort: log lỗi, marker đã commit vẫn thành công. XACK không xác nhận delivery hoặc việc đọc. Mô hình consumer hiện tại chưa hỗ trợ nhiều gateway instance.

Trình tự, payload và timeout: [chat nhóm realtime](../project-flows.md#chat-nhóm-realtime), [read notification](../project-flows.md#read-marker-unread-và-nhiều-tab).
