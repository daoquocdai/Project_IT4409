# ADR 001: Tách API, gateway và Redis Streams

Trạng thái: đã triển khai.

## Bối cảnh

HTTP API xử lý transaction ngắn, WebSocket giữ kết nối dài hạn. Hai tiến trình cần trách nhiệm và vòng đời riêng; PostgreSQL giữ lịch sử để client lấy bù khi realtime bị gián đoạn.

## Quyết định

- API kết nối PostgreSQL/Redis; gateway chỉ dùng Redis, ticket/JWT và Hub, không truy vấn database.
- Sau commit, API ghi cùng Redis Stream hai event: `message.created` mang snapshot thành viên tại message seq (gồm sender), `thread.updated` yêu cầu các kết nối tải lại summary sau read marker.
- Gateway gửi tới mọi socket của recipient, dùng một instance, group `ws-gateway` và consumer cố định `gateway-1`. Đọc pending `0` trước entry mới `>`, rồi `XACK` sau xử lý/queue; recipient offline vẫn ACK.
- Queue socket có giới hạn; kết nối chậm bị đóng. Client gộp UUID và lấy bù REST khi reconnect/gap.
- Presence lấy trực tiếp từ map socket trong RAM của Hub, phát tới các socket đã xác thực. User online khi còn ít nhất một socket đã xác thực, upgrade và đăng ký thành công; HTTP login chưa đủ. Chỉ chuyển online khi số socket từ 0 → 1 và offline khi từ 1 → 0; nhiều tab/thiết bị dùng chung trạng thái user. Chuyển tab hoặc không thao tác không làm user offline.
- Mỗi socket mới nhận `presence.snapshot` trước mọi frame presence khác, gồm toàn bộ `online_user_ids` và chính user đó; tab thứ hai cũng nhận snapshot. `presence.changed` mang `user_id`, boolean `online` và revision cho mỗi lần user đổi trạng thái. Revision thuộc riêng presence, không dùng `message.seq`. Sửa map, tăng revision, chụp snapshot và enqueue được tuần tự hóa dưới khóa Hub; I/O vẫn qua writer riêng. Queue đầy phải đóng socket để lấy snapshot khi reconnect.
- Client giữ presence trong RAM của tab, hiển thị “Chưa xác định” trước snapshot và khi mất kết nối/reconnect. Snapshot thay toàn bộ tập online; tài khoản đã biết không nằm trong tập được coi là offline. Revision cũ/trùng bị bỏ qua, gap dùng reconnect/backoff hiện có. Socket mới reset revision để nhận snapshot sau gateway restart. Event presence không tạo tin, unread hay request REST riêng.
- Gateway dùng control Ping mỗi 10 giây, chờ Pong tối đa 5 giây và giữ heartbeat JSON mỗi 5 giây. Phát hiện mất mạng im lặng thường khoảng 15 giây trong điều kiện bình thường, không phải giới hạn tuyệt đối.

## Đánh đổi

DB commit và XADD không nguyên tử; chưa có transactional outbox. Publish message lỗi trả `503` dù tin đã lưu; retry cùng UUID có thể phát event trùng. Publish read notification là best effort: log lỗi, marker đã commit vẫn thành công. XACK không xác nhận delivery hoặc việc đọc. Mô hình consumer hiện tại chưa hỗ trợ nhiều gateway instance.

Presence không được lưu vào PostgreSQL, Redis key/Stream hay cache message và không có REST endpoint. Trạng thái cùng revision mất khi gateway restart; client reconnect lấy snapshot hiện tại thay vì replay delta. Shutdown ưu tiên đóng socket an toàn, không bảo đảm mọi offline delta được phát trước khi process dừng. Giới hạn một gateway là điều kiện để map socket phản ánh đủ user; chưa có last-seen, idle hoặc ẩn trạng thái.

Trình tự, payload và timeout: [chat nhóm realtime](../project-flows.md#chat-nhóm-realtime), [presence](../project-flows.md#presence-onlineoffline), [read notification](../project-flows.md#read-marker-unread-và-nhiều-tab).
