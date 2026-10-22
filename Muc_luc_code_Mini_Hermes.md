# Mục lục tra cứu code Mini-Hermes

Dùng khi bảo vệ dự án: **nghe chức năng → tìm mục → mở file → tới hàm → lần theo luồng gọi**.

Đối chiếu trực tiếp nhánh `main` của `daoquocdai/chat-api`, commit `580c4595042c7f766381a89660242e8ff4912d06`, thời điểm commit 12/10/2026 14:26 (+07); ngày lập mục lục 15/10/2026. Các liên kết code trỏ tới file trên máy bằng đường dẫn tương đối từ thư mục chứa tài liệu, kèm mốc dòng khi có. Số dòng trên máy khớp khi bạn đang dùng đúng phiên bản đó; sau khi sửa code, ưu tiên tên hàm.

Phạm vi: API, auth, direct, nhóm, message, SQL, Redis, gateway, frontend, Go/WASM, E2EE, migration, test và tài liệu thiết kế. Đây là bản tra cứu vị trí và luồng code; không thay thế việc đọc thân hàm.

**Đi nhanh trong tài liệu**

- [1. Tra cứu ngay theo lời mentor](#1-tra-cứu-ngay-theo-lời-mentor)
- [2. Những điểm phải nói đúng theo bản hiện tại](#2-những-điểm-phải-nói-đúng-theo-bản-hiện-tại)
- [3. Khởi động, cấu hình và dependency](#3-khởi-động-cấu-hình-và-dependency)
- [4. Đăng ký, đăng nhập, JWT và actor](#4-đăng-ký-đăng-nhập-jwt-và-actor)
- [5. Direct, danh sách thread, unread và read marker](#5-direct-danh-sách-thread-unread-và-read-marker)
- [6. Nhóm, quyền và lịch sử thành viên](#6-nhóm-quyền-và-lịch-sử-thành-viên)
- [7. Gửi message, transaction, thứ tự và retry](#7-gửi-message-transaction-thứ-tự-và-retry)
- [8. Redis, snapshot recipients, ticket và gateway](#8-redis-snapshot-recipients-ticket-và-gateway)
- [9. Lịch sử, cache, reconnect và giao diện](#9-lịch-sử-cache-reconnect-và-giao-diện)
- [10. E2EE: crypto, session, backup và Go/WASM](#10-e2ee-crypto-session-backup-và-gowasm)
- [11. Toàn bộ endpoint và handler](#11-toàn-bộ-endpoint-và-handler)
- [12. Database, migration và sqlc](#12-database-migration-và-sqlc)
- [13. Các luồng mở code liên tiếp](#13-các-luồng-mở-code-liên-tiếp)
- [14. Bảy câu hỏi bảo vệ: mở đoạn nào làm bằng chứng?](#14-bảy-câu-hỏi-bảo-vệ-mở-đoạn-nào-làm-bằng-chứng)
- [15. Test: cần chứng minh hành vi thì mở đâu?](#15-test-cần-chứng-minh-hành-vi-thì-mở-đâu)
- [16. Danh mục 111 file triển khai, cấu hình, test và tài liệu](#16-danh-mục-111-file-triển-khai-cấu-hình-test-và-tài-liệu)
- [17. Cách dùng ngay trước buổi bảo vệ](#17-cách-dùng-ngay-trước-buổi-bảo-vệ)

## Cách mở nhanh trong VS Code

1. Mở thư mục gốc repo trên máy bạn. Nếu vẫn dùng vị trí cũ, đó là `D:\VinAI\Project\chat-api`.
2. Nhấn `Ctrl + P`, dán đường dẫn tương đối kèm dòng, ví dụ `internal/module/message/repository/postgres.go:25`, rồi Enter. Các đường dẫn trong tài liệu đều tính từ gốc repo.
3. Trong file, `Ctrl + Shift + O` tìm symbol/hàm; hoặc `Ctrl + F` tìm tên hàm. `Ctrl + G` nhảy tới dòng.
4. `F12` tới định nghĩa; `Ctrl + F12` tới implementation khi dừng ở interface Go; `Alt + ←` quay lại. Các thao tác Go cần extension Go/language server hoạt động.
5. Chưa biết file: `Ctrl + Shift + F` tìm endpoint hoặc tên hàm. Nhiều file có cùng `Send`, `List`, `New`, `writeError`, vì vậy luôn nhìn cả đường dẫn module.

Trong Markdown preview của VS Code, bấm link để mở file trong dự án trên máy; liên kết có `#L...` giữ mốc dòng cần tra cứu. Bạn cũng có thể lấy phần `đường/dẫn:dòng` trong bảng và dùng `Ctrl + P`.

## 1. Tra cứu ngay theo lời mentor

| Mentor yêu cầu mở… | Vị trí bắt đầu |
| --- | --- |
| Khởi động API | [cmd/main.go:38](./cmd/main.go#L38) — `run` |
| Khởi động gateway / dừng tiến trình | [cmd/ws-gateway/main.go:26](./cmd/ws-gateway/main.go#L26) — `run` |
| Danh sách endpoint | [internal/route/router.go:44](./internal/route/router.go#L44) — `New` |
| Cấu hình / timeout / cổng | [config/config.go:58](./config/config.go#L58) — `Load` |
| Đăng ký từ UI | [web/app.js:1530](./web/app.js#L1530) — `registerForm.addEventListener` |
| Đăng nhập từ UI | [web/app.js:1559](./web/app.js#L1559) — `loginForm.addEventListener` |
| Argon2id / HKDF từ mật khẩu | [internal/e2ee/account.go:50](./internal/e2ee/account.go#L50) — `DeriveCredentials` |
| Backend hash và so credential | [internal/module/user/service/service.go:49](./internal/module/user/service/service.go#L49) — `Register` |
| Tạo / xác minh JWT | [internal/token/jwt.go:51](./internal/token/jwt.go#L51) — `Create` |
| Middleware lấy actor | [internal/middleware/auth.go:16](./internal/middleware/auth.go#L16) — `RequireAuthentication` |
| Tạo direct / chống tạo trùng | [internal/module/thread/repository/postgres.go:25](./internal/module/thread/repository/postgres.go#L25) — `CreateOrGetDirect` |
| Tạo nhóm | [internal/module/thread/repository/groups.go:14](./internal/module/thread/repository/groups.go#L14) — `CreateGroup` |
| Thêm, xóa, rời nhóm / quyền admin | [internal/module/thread/repository/groups.go:45](./internal/module/thread/repository/groups.go#L45) — `ChangeMember` |
| Giới hạn số thành viên | [internal/module/thread/model/thread.go:26](./internal/module/thread/model/thread.go#L26) — `MaxGroupMembers` |
| Gửi tin: HTTP handler | [internal/module/message/handler/handler.go:42](./internal/module/message/handler/handler.go#L42) — `Send` |
| Gửi tin: nghiệp vụ | [internal/module/message/service/service.go:67](./internal/module/message/service/service.go#L67) — `Send` |
| Transaction / UUID retry / seq | [internal/module/message/repository/postgres.go:25](./internal/module/message/repository/postgres.go#L25) — `Send` |
| SQL khóa thread | [db/queries/messages.sql:15](./db/queries/messages.sql#L15) — `LockThreadForParticipant` |
| SQL tăng seq | [db/queries/messages.sql:64](./db/queries/messages.sql#L64) — `IncrementThreadSequence` |
| Lịch sử / cursor / quyền theo membership | [db/queries/messages.sql:110](./db/queries/messages.sql#L110) — `ListThreadMessagesPage` |
| Read marker | [internal/module/thread/repository/postgres.go:138](./internal/module/thread/repository/postgres.go#L138) — `MarkRead` |
| Unread COUNT | [db/queries/threads.sql:67](./db/queries/threads.sql#L67) — `ListThreadsForUser` |
| Publish sau commit / recipients | [internal/module/message/service/publish.go:21](./internal/module/message/service/publish.go#L21) — `PublishMessage` |
| XADD message | [internal/module/message/publisher/redis.go:26](./internal/module/message/publisher/redis.go#L26) — `Publish` |
| Cache snapshot thành viên | [internal/module/thread/membership/redis.go:36](./internal/module/thread/membership/redis.go#L36) — `Get` |
| Xin vé WebSocket | [internal/wsticket/service.go:30](./internal/wsticket/service.go#L30) — `Issue` |
| Vé dùng một lần / GETDEL | [internal/wsticket/redis.go:26](./internal/wsticket/redis.go#L26) — `Consume` |
| Upgrade WebSocket | [internal/gateway/handler.go:31](./internal/gateway/handler.go#L31) — `ServeHTTP` |
| XREADGROUP / pending / XACK | [internal/gateway/consumer.go:49](./internal/gateway/consumer.go#L49) — `consume` |
| Map kết nối / fanout / chậm client | [internal/gateway/hub.go:213](./internal/gateway/hub.go#L213) — `queueTo` |
| Gộp tin trùng UUID | [web/realtime-core.js:3](./web/realtime-core.js#L3) — `merge` |
| Hiển thị theo seq | [web/app.js:653](./web/app.js#L653) — `sortedMessages` |
| Reconnect / xin lại ticket | [web/app.js:960](./web/app.js#L960) — `connectWebSocket` |
| Tải lịch sử và lấy bù | [web/app.js:774](./web/app.js#L774) — `catchUpConversation` |
| Đổi thread dùng cache | [web/app.js:1249](./web/app.js#L1249) — `openThread` |
| X3DH tạo session | [internal/e2ee/epoch.go:121](./internal/e2ee/epoch.go#L121) — `CreateEpoch` |
| Hai bên khởi tạo epoch đồng thời | [internal/module/e2ee/repository/postgres.go:126](./internal/module/e2ee/repository/postgres.go#L126) — `CreateEpoch` |
| Mã hóa / giải mã từng tin | [internal/e2ee/messages.go:85](./internal/e2ee/messages.go#L85) — `SealMessage` |
| Khôi phục tài khoản / session | [web/e2ee.js:138](./web/e2ee.js#L138) — `_restore` |
| Retry ciphertext nguyên trạng | [web/e2ee.js:245](./web/e2ee.js#L245) — `_post` |
| Outbox lưu ở browser | [web/e2ee-state.js:5](./web/e2ee-state.js#L5) — `outbox` |
| WASM bridge | [cmd/e2ee-wasm/main_js.go:38](./cmd/e2ee-wasm/main_js.go#L38) — `main` |
| Build / run / test | [Makefile:1](./Makefile#L1) |

## 2. Những điểm phải nói đúng theo bản hiện tại

- **Argon2id ở client, bcrypt ở backend.** Client chạy Go/WASM để dẫn xuất `auth_credential` và `vault_key` riêng bằng HKDF. Backend hash `auth_credential` bằng bcrypt; API auth không nhận mật khẩu gốc hay vault key. Xem [internal/e2ee/account.go:50](./internal/e2ee/account.go#L50) — `DeriveCredentials` và [internal/module/user/service/service.go:49](./internal/module/user/service/service.go#L49) — `Register`.
- **Direct luôn E2EE v2, nhóm plaintext.** Không còn cột `encryption_mode`; kiểm tra định dạng theo `thread.Kind` nằm trong repository gửi tin.
- **Một phiên khóa cố định cho mỗi direct.** X3DH lúc khởi tạo, HKDF cho từng message; chưa dùng Double Ratchet hoặc rekey. ADR 005 là thiết kế hiện tại, ADR 004 là lịch sử đã bị thay thế.
- **Gateway hiện hỗ trợ một instance**, consumer cố định `gateway-1`. Có phục hồi pending của chính consumer, chưa có giải pháp fanout nhiều gateway.
- **XACK sau xử lý/đưa vào queue**, không đợi xác nhận nhận hoặc đọc của client. Recipient offline vẫn có thể ACK; lịch sử khôi phục qua REST.
- **Chưa có transactional outbox.** Commit PostgreSQL và XADD Redis là hai bước; publish message lỗi trả 503 dù tin có thể đã lưu. Read notification lỗi chỉ log và vẫn trả marker đã commit.
- **Nhóm tối đa 100 thành viên** tính cả người tạo. Câu hỏi nhóm 10.000 là tình huống mở rộng giả định, chưa phải năng lực đã chứng minh.
- `message_id` bên HTTP ánh xạ tới `messages.external_id`; `client_msg_id` và hai cột `direct_user_low_id/high_id` đã bị bỏ. `lowID/highID` vẫn có thể xuất hiện như biến cục bộ để sắp thứ tự khóa user.

## 3. Khởi động, cấu hình và dependency

Mở `cmd/main.go` để giải thích các đối tượng được tạo và truyền vào nhau. Gateway có entrypoint riêng.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| API tạo các thành phần thế nào? | [cmd/main.go:38](./cmd/main.go#L38) — `run` | Load config → pool Postgres/Ping → Redis/Ping → JWT → repository → service → handler → router.Run. |
| Gateway có kết nối DB không? | [cmd/ws-gateway/main.go:26](./cmd/ws-gateway/main.go#L26) — `run` | Tạo Redis, JWT/ticket, Hub và Consumer; không tạo pool Postgres. |
| Goroutine chạy ở đâu? | [cmd/ws-gateway/main.go:58](./cmd/ws-gateway/main.go#L58) — `serve` | Consumer và HTTP server chạy trong các goroutine; signal/context điều khiển dừng. |
| Shutdown đóng socket thế nào? | [internal/gateway/hub.go:81](./internal/gateway/hub.go#L81) — `Stop` | Chặn đăng ký mới, cancel I/O, đóng socket và đợi WaitGroup. |
| Đọc và kiểm tra cấu hình | [config/config.go:58](./config/config.go#L58) — `Load` | Config API; LoadGateway dùng cấu hình chung nhưng không yêu cầu URL Postgres. |
| Giá trị cấu hình mẫu | [config/config.yml.example:1](./config/config.yml.example#L1) | HTTP/WS address, public WS URL, origins, ticket TTL, DB, JWT, Redis. |
| Công nghệ và dependency | [go.mod:1](./go.mod#L1) | Các dependency trực tiếp; phần indirect không đồng nghĩa dự án dùng trực tiếp mọi công nghệ trong đó. |
| Lệnh chạy, build WASM, migration | [Makefile:1](./Makefile#L1) | run, gateway, up, migrate, sqlc, wasm, test, build. |
| Postgres và Redis local | [docker-compose.yml:1](./docker-compose.yml#L1) | Hai service hạ tầng dùng cho môi trường phát triển. |

## 4. Đăng ký, đăng nhập, JWT và actor

Luồng mật khẩu bắt đầu ở browser. Muốn chỉ đầy đủ auth, mở cả code client lẫn user service.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Người dùng bấm đăng ký | [web/app.js:1530](./web/app.js#L1530) — `registerForm.addEventListener` | Gọi createAccount ở client, chỉ gửi credential/KDF/public bundle/encrypted vault; rồi đăng nhập. |
| Tạo khóa và vault tại client | [cmd/e2ee-wasm/session_js.go:67](./cmd/e2ee-wasm/session_js.go#L67) — `createAccount` | Gọi crypto để tạo KDF, credential, private-key vault và bản vault mã hóa. |
| Thông số Argon2id | [internal/e2ee/account.go:21](./internal/e2ee/account.go#L21) — `NewKDFProfile` | Salt 16 byte; 65.536 KiB, 3 iterations, parallelism 4; output master 32 byte. |
| Tách khóa đăng nhập và vault | [internal/e2ee/account.go:50](./internal/e2ee/account.go#L50) — `DeriveCredentials` | argon2.IDKey → HKDF với hai nhãn khác nhau; không dùng auth credential làm vault key. |
| Backend nhận đăng ký | [internal/module/user/handler/handler.go:30](./internal/module/user/handler/handler.go#L30) — `Register` | Giới hạn body, bind DTO, gọi service, trả HTTP. |
| Không cho gửi raw password / field lạ | [internal/module/user/dto/user.go:48](./internal/module/user/dto/user.go#L48) — `decodeRequest` | Decoder kiểm tra đúng các trường auth được phép. |
| Hash credential / kiểm tra dữ liệu tài khoản | [internal/module/user/service/service.go:49](./internal/module/user/service/service.go#L49) — `Register` | Chuẩn hóa username, validate credential/KDF/bundle/vault, bcrypt.GenerateFromPassword. |
| Lưu user cùng public OPK | [internal/module/user/repository/postgres.go:26](./internal/module/user/repository/postgres.go#L26) — `CreateAccount` | User và các one-time prekey được insert trong cùng transaction. |
| Lấy KDF trước đăng nhập | [internal/module/user/service/service.go:73](./internal/module/user/service/service.go#L73) — `AuthParams` | GET auth/params trả KDF đã lưu theo username chuẩn hóa. |
| Người dùng bấm đăng nhập | [web/app.js:1559](./web/app.js#L1559) — `loginForm.addEventListener` | Lấy auth params → derive credential/vault key → finishLogin. |
| Gửi credential và mở phiên UI | [web/app.js:1505](./web/app.js#L1505) — `finishLogin` | Gửi auth_credential, đối chiếu user_id/JWT, giữ vault key và khôi phục tài khoản. |
| Backend kiểm tra đăng nhập | [internal/module/user/service/service.go:81](./internal/module/user/service/service.go#L81) — `Login` | GetCredentialsByUsername → bcrypt.CompareHashAndPassword → tokens.Create. |
| Tạo token | [internal/token/jwt.go:51](./internal/token/jwt.go#L51) — `Create` | HS256; sub là external UUID user, có iat và exp. |
| Xác minh token | [internal/token/jwt.go:78](./internal/token/jwt.go#L78) — `Verify` | Kiểm tra header, signature bằng hmac.Equal, cấu trúc claims và hạn dùng. |
| Actor đến từ đâu? | [internal/middleware/auth.go:16](./internal/middleware/auth.go#L16) — `RequireAuthentication` | Đọc Bearer, Verify, lưu user ID vào Gin context; handler đọc qua AuthenticatedUserID. |
| Liệt kê user | [internal/module/user/handler/handler.go:85](./internal/module/user/handler/handler.go#L85) — `List` | Handler → service.List → repository.List → ListUsers SQL. |

## 5. Direct, danh sách thread, unread và read marker

Không tìm các cột cặp user đã bỏ. Tạo direct hiện dựa trên participants và khóa hai user theo thứ tự.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Tạo/mở direct ở UI | [web/app.js:1273](./web/app.js#L1273) — `openDirect` | Nếu đã có thread cache thì mở lại; nếu chưa có mới POST /threads/direct. |
| Kiểm tra peer và cấm chat chính mình | [internal/module/thread/service/service.go:48](./internal/module/thread/service/service.go#L48) — `CreateOrGetDirect` | Tra actor/peer, kiểm tra hai ID khác nhau rồi gọi repository. |
| Chống tạo hai direct cùng cặp | [internal/module/thread/repository/postgres.go:25](./internal/module/thread/repository/postgres.go#L25) — `CreateOrGetDirect` | Sắp low/high ID, khóa 2 user, tìm direct hiện hữu, chỉ tạo nếu chưa có; ghi 2 participant trong transaction. |
| SQL khóa user theo thứ tự | [db/queries/threads.sql:6](./db/queries/threads.sql#L6) — `LockUsersForDirectThread` | ORDER BY id FOR UPDATE; sau khóa mới tìm direct cùng participants. |
| Tìm direct bằng participants | [db/queries/threads.sql:13](./db/queries/threads.sql#L13) — `GetDirectThreadByParticipants` | COUNT=2, MIN/MAX user ID; không dựa vào cột direct_user_low/high_id. |
| Summary thread và unread | [db/queries/threads.sql:67](./db/queries/threads.sql#L67) — `ListThreadsForUser` | COUNT các message của người khác sau marker và trong membership hoạt động; gồm text/system. |
| Endpoint đánh dấu đọc | [internal/module/thread/handler/handler.go:82](./internal/module/thread/handler/handler.go#L82) — `MarkRead` | Actor từ middleware; parse last_read_seq rồi gọi service. |
| Transaction cập nhật marker | [internal/module/thread/repository/postgres.go:138](./internal/module/thread/repository/postgres.go#L138) — `MarkRead` | Khóa thread, kiểm tra active participant, cập nhật marker và lấy peer cho direct. |
| Marker không được giảm / vượt last_seq | [db/queries/threads.sql:103](./db/queries/threads.sql#L103) — `MarkThreadRead` | GREATEST(marker cũ, N); joined_seq−1 ≤ N ≤ thread.last_seq. |
| Thông báo marker sang các tab | [internal/module/thread/service/service.go:92](./internal/module/thread/service/service.go#L92) — `MarkRead` | Sau commit publish thread.updated: direct tới reader và peer, group tới reader. Lỗi publish chỉ log. |
| Publish notification | [internal/module/thread/publisher/redis.go:24](./internal/module/thread/publisher/redis.go#L24) — `Publish` | Ghi thread.updated vào cùng Redis Stream, không tạo message mới. |
| UI khi nào được tăng marker? | [web/app.js:1084](./web/app.js#L1084) — `renderedReadSequence` | Thread mở, visible, ở cuối chat, đã sync/render; direct phải giải mã thành công; không vượt syncedSeq. |
| UI gửi marker lên API | [web/app.js:1191](./web/app.js#L1191) — `flushReadMarker` | Gộp pending marker, PUT /threads/:id/read, kiểm tra snapshot phiên/membership. |

## 6. Nhóm, quyền và lịch sử thành viên

Các thao tác nhóm dùng chung sequence với tin text thông qua system message.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Request nhóm và membership | [internal/module/thread/handler/groups.go:11](./internal/module/thread/handler/groups.go#L11) — `CreateGroup` | CreateGroup, Members, AddMember, RemoveMember và Leave nằm cùng file. |
| Validate nhóm và thành viên | [internal/module/thread/service/groups.go:12](./internal/module/thread/service/groups.go#L12) — `CreateGroup` | Tên nhóm, trùng user, giới hạn và user tồn tại; tạo nội dung system message. |
| Tạo nhóm trong transaction | [internal/module/thread/repository/groups.go:14](./internal/module/thread/repository/groups.go#L14) — `CreateGroup` | Tạo thread, creator admin, participants và system message rồi trả summary. |
| Thêm/xóa/rời nhóm gọi vào đâu? | [internal/module/thread/service/groups.go:70](./internal/module/thread/service/groups.go#L70) — `changeMember` | Chuẩn hóa actor/target, gọi ChangeMember rồi publish system message sau commit. |
| Phân quyền admin và cập nhật membership | [internal/module/thread/repository/groups.go:45](./internal/module/thread/repository/groups.go#L45) — `ChangeMember` | Khóa thread, kiểm tra group/actor/admin, xử lý add/remove/leave và retry trạng thái cũ. |
| Admin cuối rời nhóm | [db/queries/groups.sql:53](./db/queries/groups.sql#L53) — `PromoteOldestGroupMember` | Trong ChangeMember: nếu còn thành viên và không còn admin, chọn người tham gia sớm nhất; tie-break user_id. |
| Thành viên vào lại nhóm | [db/queries/groups.sql:25](./db/queries/groups.sql#L25) — `CreateGroupParticipant` | Tạo hàng membership mới; joined_seq và marker mới, giữ hàng cũ để kiểm tra khoảng lịch sử. |
| Đánh dấu rời nhóm | [db/queries/groups.sql:30](./db/queries/groups.sql#L30) — `EndParticipant` | Ghi left_seq/left_at trên hàng membership đang hoạt động. |
| Danh sách thành viên | [internal/module/thread/repository/groups.go:140](./internal/module/thread/repository/groups.go#L140) — `ListMembers` | Chỉ active member được xem members; SQL lọc participants đang hoạt động. |
| System message lấy seq ở đâu? | [internal/module/thread/repository/groups.go:177](./internal/module/thread/repository/groups.go#L177) — `createSystemMessage` | IncrementThreadSequence → CreateSystemMessage trong transaction của thao tác nhóm. |
| Giới hạn 100 ở đâu? | [internal/module/thread/model/thread.go:26](./internal/module/thread/model/thread.go#L26) — `MaxGroupMembers` | Hằng MaxGroupMembers=100, được kiểm tra lúc tạo và thêm thành viên. |
| UI tạo và khôi phục nhóm khi publish lỗi | [web/app.js:1400](./web/app.js#L1400) — `recoverCreatedGroup` | Đối chiếu nhóm đã tạo sau lỗi chưa rõ kết quả; không mặc định tạo nhóm mới. |
| UI thao tác membership | [web/app.js:1365](./web/app.js#L1365) — `changeMembership` | Gọi API add/remove/leave và cập nhật cache/quyền theo snapshot. |

## 7. Gửi message, transaction, thứ tự và retry

Đây là phần nên ghim sẵn khi bảo vệ. Thứ tự đọc: handler → service → repository → SQL → publish.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Nhận POST message | [internal/module/message/handler/handler.go:42](./internal/module/message/handler/handler.go#L42) — `Send` | Lấy actor, thread ID, JSON; service trả message + created; map kết quả/lỗi HTTP. |
| Kiểm tra nội dung / content_format | [internal/module/message/service/service.go:67](./internal/module/message/service/service.go#L67) — `Send` | Plaintext 1–1000 rune, không NUL; e2ee_v2 parse envelope; tra actor. |
| Transaction và kiểm tra quyền | [internal/module/message/repository/postgres.go:25](./internal/module/message/repository/postgres.go#L25) — `Send` | pgx.BeginFunc, LockThreadForParticipant, kiểm tra lại active membership sau khi lấy khóa. |
| Chống trùng UUID | [db/queries/messages.sql:45](./db/queries/messages.sql#L45) — `GetMessageByExternalID` | Repository so thread/sender/kind/format/content; đúng trả tin cũ, sai ErrMessageIDConflict. |
| Khóa cấp thứ tự nằm ở đâu? | [db/queries/messages.sql:15](./db/queries/messages.sql#L15) — `LockThreadForParticipant` | FOR UPDATE OF t khóa hàng thread tại PostgreSQL, phối hợp được nhiều API process. |
| Cấp seq và insert | [db/queries/messages.sql:64](./db/queries/messages.sql#L64) — `IncrementThreadSequence` | UPDATE last_seq=last_seq+1 RETURNING; CreateThreadMessage cùng transaction. |
| Direct có gửi plaintext được không? | [internal/module/message/repository/postgres.go:25](./internal/module/message/repository/postgres.go#L25) — `Send` | expectedFormat: direct=e2ee_v2; group=plaintext. Retry hợp lệ kiểm tra trước nhánh cấp seq mới. |
| Backend kiểm tra envelope nhưng không decrypt | [internal/module/message/repository/postgres.go:133](./internal/module/message/repository/postgres.go#L133) — `validateEnvelopeHeader` | Recipient phải là peer; epoch phải thuộc thread. Không gọi OpenMessage trên đường xử lý message API. |
| Publish ở trước hay sau commit? | [internal/module/message/service/service.go:67](./internal/module/message/service/service.go#L67) — `Send` | repository.Send chỉ trả sau transaction thành công; sau đó service gọi PublishMessage. |
| Redis lỗi trả HTTP gì? | [internal/module/message/handler/handler.go:147](./internal/module/message/handler/handler.go#L147) — `writeError` | EventPublishError → 503 kèm thread_id/message_id/seq khi có; tin DB có thể đã commit. |
| Chi tiết lỗi publish | [internal/module/message/model/errors.go:24](./internal/module/message/model/errors.go#L24) — `EventPublishError` | Giữ định danh tin và Cause; hỗ trợ errors.Is/errors.As. |
| Gửi nhóm và giữ UUID/body ở UI | [web/app.js:1583](./web/app.js#L1583) — `messageForm.addEventListener` | pendingSend giữ messageID/content; definite 400/413 giải phóng pending, lỗi chưa rõ giữ để retry. |
| POST plaintext cùng body khi retry | [web/app.js:234](./web/app.js#L234) — `sendMessageWithRetry` | Đường gọi HTTP cho nhóm, dùng messageID/content của pending. |
| Gửi direct và retry ciphertext | [web/e2ee.js:262](./web/e2ee.js#L262) — `send` | Khôi phục session, tạo UUID, seal một lần, lưu exact body vào outbox rồi POST. |

## 8. Redis, snapshot recipients, ticket và gateway

Phân biệt bốn nơi dùng Redis: event Stream, membership snapshot cache, WS ticket và consumer group/pending.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Chuẩn bị event sau commit | [internal/module/message/service/publish.go:21](./internal/module/message/service/publish.go#L21) — `PublishMessage` | context.WithoutCancel + timeout riêng, tra recipients rồi gọi publisher. |
| Chọn recipients đúng seq lịch sử | [internal/module/message/service/publish.go:38](./internal/module/message/service/publish.go#L38) — `messageRecipients` | Version membership tại message seq; cache miss/lỗi thì lấy snapshot Postgres; gồm sender. |
| Version snapshot và khoảng membership | [db/queries/messages.sql:35](./db/queries/messages.sql#L35) — `GetMembershipVersion` | Boundary joined_seq và left_seq+1; tin system tại left_seq vẫn có người vừa rời nhận. |
| Cache Redis có phải nguồn phân quyền? | [internal/module/thread/membership/redis.go:36](./internal/module/thread/membership/redis.go#L36) — `Get` | Chỉ cache snapshot bất biến, TTL 15 phút; phân quyền gửi/đọc vẫn ở DB. |
| Event gồm những trường gì? | [internal/module/message/event/event.go:24](./internal/module/message/event/event.go#L24) — `FromMessage` | MessageCreated và FromMessage chuyển model sang contract event. |
| XADD thật sự ở đâu? | [internal/module/message/publisher/redis.go:26](./internal/module/message/publisher/redis.go#L26) — `Publish` | Ghi các trường event, recipient_ids JSON, seq và created_at vào Redis Stream. |
| Sinh ticket 32 byte | [internal/wsticket/service.go:30](./internal/wsticket/service.go#L30) — `Issue` | crypto/rand, base64url; SetNX kèm TTL; tối đa 3 lần thử khi đụng vé. |
| Consume ticket dùng một lần | [internal/wsticket/redis.go:26](./internal/wsticket/redis.go#L26) — `Consume` | GetDel nguyên tử lấy owner và xóa vé; hết hạn/đã dùng trả invalid. |
| Gateway xác thực | [internal/gateway/handler.go:71](./internal/gateway/handler.go#L71) — `authenticate` | Có Authorization thì verify JWT; nếu không dùng ticket với timeout. |
| Upgrade và đăng ký socket | [internal/gateway/handler.go:31](./internal/gateway/handler.go#L31) — `ServeHTTP` | Validate UUID, kiểm tra Origin khi Accept, thêm vào Hub, theo dõi đóng kết nối. |
| Tạo consumer group và đọc tin mới | [internal/gateway/consumer.go:49](./internal/gateway/consumer.go#L49) — `consume` | XGroupCreateMkStream, recoverPending trước, XReadGroup với > sau. |
| Crash trước XACK | [internal/gateway/consumer.go:76](./internal/gateway/consumer.go#L76) — `recoverPending` | XReadGroup với 0 đọc pending của consumer gateway-1; có thể phát event lại. |
| Queue xong rồi ACK | [internal/gateway/consumer.go:97](./internal/gateway/consumer.go#L97) — `handleStreams` | Decode → Dispatch/DispatchThreadUpdated → XAck; poison entry log và ACK để tránh vòng lặp. |
| Một user nhiều tab / thiết bị | [internal/gateway/hub.go:60](./internal/gateway/hub.go#L60) — `add` | clients là map user ID → tập client; mỗi socket có queue riêng. |
| Fanout event tới recipients | [internal/gateway/hub.go:175](./internal/gateway/hub.go#L175) — `Dispatch` | Lặp recipient_ids, serialize wire payload và queue tới các socket tương ứng. |
| Socket chậm thì sao? | [internal/gateway/hub.go:213](./internal/gateway/hub.go#L213) — `queueTo` | Queue bounded, enqueue non-blocking; đầy queue thì đóng connection chậm để client lấy bù REST. |
| Heartbeat và ping | [internal/gateway/hub.go:123](./internal/gateway/hub.go#L123) — `writeLoop` | Heartbeat application 5s; ping 30s; write timeout 5s; queueSize=64. |
| Nhiều gateway có chạy đúng chưa? | [internal/gateway/consumer.go:20](./internal/gateway/consumer.go#L20) — `const DefaultConsumer` | Chú thích và wiring hiện tại giới hạn một instance, consumer cố định gateway-1. |

## 9. Lịch sử, cache, reconnect và giao diện

REST cung cấp lịch sử; WebSocket thông báo realtime. Client chịu trách nhiệm gộp, hiển thị theo seq và lấy bù.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Parse limit/before_seq | [internal/module/message/handler/handler.go:113](./internal/module/message/handler/handler.go#L113) — `listQuery` | Kiểm tra query đơn trị, số dương và giới hạn page size. |
| Repository tạo page/cursor | [internal/module/message/repository/postgres.go:167](./internal/module/message/repository/postgres.go#L167) — `List` | Kiểm tra history access; lấy limit+1, cắt page và đặt next_cursor. |
| SQL lọc các lần tham gia nhóm | [db/queries/messages.sql:110](./db/queries/messages.sql#L110) — `ListThreadMessagesPage` | EXISTS membership với joined_seq ≤ seq ≤ left_seq khi đã rời; before_seq; ORDER BY seq DESC. |
| Mở thread lần đầu / mở lại | [web/app.js:1249](./web/app.js#L1249) — `openThread` | messagesLoaded thì render cache; chưa tải mới loadInitialHistory. |
| Cache theo thread | [web/app.js:326](./web/app.js#L326) — `newThreadCache` | Giữ summary, map messages/messageIDs, cursor, syncedSeq, drafts và request đang chạy. |
| Lần đầu lấy lịch sử | [web/app.js:738](./web/app.js#L738) — `loadInitialHistory` | Fetch tới boundary/baseline, merge dữ liệu, đặt syncedSeq/messagesLoaded. |
| Lấy bù khi thiếu tin | [web/app.js:774](./web/app.js#L774) — `catchUpConversation` | Từ trang mới nhất đọc tới baseline đã sync hoặc hết cursor; gộp request và target mới. |
| Điều kiện gọi lấy bù từ event/summary | [web/app.js:490](./web/app.js#L490) — `updateThreadFromMessage` | Đối chiếu seq; loadThreads(true) cũng đối chiếu cache khi reconnect. |
| Thuật toán đi qua các page | [web/realtime-core.js:35](./web/realtime-core.js#L35) — `fetchThroughBoundary` | Dùng before_seq/next_cursor; phát hiện cursor lặp hoặc không tiến; không có after_seq. |
| Tải các tin cũ hơn | [web/app.js:1048](./web/app.js#L1048) — `loadOlderMessages` | Dùng nextCursor của cache để gọi page trước đó. |
| Chống hiển thị trùng và payload lệch | [web/realtime-core.js:3](./web/realtime-core.js#L3) — `merge` | Map UUID↔seq, kiểm tra context/content bất biến; validate cả page trước khi cập nhật. |
| Gộp HTTP response và WS event | [web/app.js:514](./web/app.js#L514) — `acceptMessage` | Chuẩn hóa receivedMessage, vào cache của thread và đối chiếu dữ liệu đã có. |
| Sắp thứ tự hiển thị | [web/app.js:653](./web/app.js#L653) — `sortedMessages` | Sort tăng dần theo seq; không sắp bằng timestamp hay thứ tự event đến. |
| Render text và trạng thái E2EE | [web/app.js:669](./web/app.js#L669) — `renderMessages` | Render message/cache, trạng thái pending/error/ready và dấu đã render dùng cho marker. |
| Giải mã async | [web/app.js:621](./web/app.js#L621) — `processE2EEMessages` | Gọi client.receive và chỉ nhận kết quả khi session/membership snapshot vẫn đúng. |
| Nhận các loại event | [web/app.js:929](./web/app.js#L929) — `handleSocketMessage` | thread.updated → refresh summary; message.created → accept/render. |
| Xin ticket và mở WS | [web/app.js:960](./web/app.js#L960) — `connectWebSocket` | POST ws-ticket, new WebSocket, đăng ký onopen/onmessage/onclose; reconnect tải lại summary/lấy bù. |
| Backoff reconnect | [web/app.js:910](./web/app.js#L910) — `scheduleReconnect` | Delay nhân đôi, tối đa 30s; kiểm tra generation/session trước thao tác. |
| Watchdog socket | [web/app.js:885](./web/app.js#L885) — `ensureWebSocket` | Socket OPEN được kiểm tra heartbeat/grace; không tự xin ticket chỉ vì quay lại tab khi socket khỏe. |
| Tab ẩn / quay lại / online | [web/app.js:1691](./web/app.js#L1691) — `document.addEventListener("visibilitychange"` | Ẩn tab dừng health timer với socket OPEN; visible/online gọi ensureWebSocket. |
| Response cũ sau đổi tài khoản/thread | [web/app.js:320](./web/app.js#L320) — `currentSessionMatches` | sessionVersion/token và cache/conversation/membership snapshot chặn kết quả cũ ghi vào phiên mới. |
| Reload giữ gì? | [web/app.js:1485](./web/app.js#L1485) — `cacheSession` | JWT, username, vault key và user tương ứng trong sessionStorage; không phải chỉ ciphertext. |
| Làm mới danh sách tài khoản | [web/app.js:407](./web/app.js#L407) — `loadUsers` | GET /users; nút refresh gọi lại, giữ đúng phiên đang hoạt động. |

## 10. E2EE: crypto, session, backup và Go/WASM

Ba lớp khác nhau: internal/e2ee là thuật toán dùng trong browser qua WASM; web/e2ee.js điều phối client; internal/module/e2ee là API lưu/kiểm tra dữ liệu công khai hoặc bản mã.

| Mentor hỏi / việc cần tìm | Mở file và hàm | Ý chính cần chỉ ra |
| --- | --- | --- |
| Tạo identity / signed prekey / OPK | [internal/e2ee/account.go:101](./internal/e2ee/account.go#L101) — `GenerateAccountVault` | Tạo private keys gốc; public bundle và private account vault tách nhau; 20 OPK ban đầu. |
| Mã hóa vault tài khoản | [internal/e2ee/account.go:206](./internal/e2ee/account.go#L206) — `EncryptAccountVault` | Vault key + AAD username/KDF/public bundle → encrypted record. |
| Mở vault trên thiết bị mới | [internal/e2ee/account.go:222](./internal/e2ee/account.go#L222) — `OpenAccountVault` | Giải mã và kiểm tra bộ private keys khớp public bundle. |
| Private/public key X25519 | [internal/e2ee/crypto.go:36](./internal/e2ee/crypto.go#L36) — `GenerateKeyPair` | crypto/ecdh X25519 với crypto/rand. |
| Ký signed prekey / verify bundle | [internal/e2ee/crypto.go:63](./internal/e2ee/crypto.go#L63) — `SignPrekey` | SignPrekey/VerifyBundle; dùng biến thể signature của libsignal được chú thích rõ trong file. |
| Tra và claim public bundle | [internal/module/e2ee/repository/postgres.go:40](./internal/module/e2ee/repository/postgres.go#L40) — `Claim` | Xác minh hai thành viên direct, khóa user recipient, tiêu thụ OPK nếu còn. |
| OPK được tiêu thụ thế nào? | [db/queries/prekeys.sql:15](./db/queries/prekeys.sql#L15) — `ConsumeE2EEOneTimePrekey` | DELETE RETURNING public OPK; private OPK gốc vẫn ở encrypted account vault. |
| X3DH bên khởi tạo | [internal/e2ee/epoch.go:121](./internal/e2ee/epoch.go#L121) — `CreateEpoch` | 3 DH hoặc thêm DH4 khi có OPK; deriveKey → session key → confirmation trong header. |
| X3DH bên nhận | [internal/e2ee/epoch.go:190](./internal/e2ee/epoch.go#L190) — `OpenEpoch` | Tính DH đối ứng từ private vault, VerifyEpoch trước khi trả session key. |
| HKDF của X3DH | [internal/e2ee/crypto.go:163](./internal/e2ee/crypto.go#L163) — `deriveKey` | Ghép DH inputs, dẫn xuất SK bằng HKDF; khác HKDF dẫn xuất khóa mỗi message. |
| Header/epoch context | [internal/e2ee/epoch.go:60](./internal/e2ee/epoch.go#L60) — `ValidateEpochHeader` | Ràng buộc thread/epoch/sender/recipient/identity/prekey và wire format. |
| Hai client cùng tạo session | [internal/module/e2ee/repository/postgres.go:126](./internal/module/e2ee/repository/postgres.go#L126) — `CreateEpoch` | Khóa thread; epoch đầu commit thắng; đề xuất khác nhận EpochConflictError mang epoch canonical. |
| Client xử lý proposal thua | [web/e2ee.js:191](./web/e2ee.js#L191) — `_createEpoch` | 409 → khôi phục epoch canonical; không sử dụng SK của proposal thua. |
| Khôi phục SK bằng backup | [web/e2ee.js:138](./web/e2ee.js#L138) — `_restore` | Có backup thì mở; recipient chưa có thì OpenEpoch, upload backup rồi mở bản server đã commit. |
| Encrypt/decrypt backup SK | [internal/e2ee/epoch.go:251](./internal/e2ee/epoch.go#L251) — `EncryptEpochBackup` | EncryptEpochBackup/OpenEpochBackup; ràng buộc owner và header, dùng khóa dẫn xuất từ vault key. |
| Lưu backup bất biến | [internal/module/e2ee/repository/postgres.go:243](./internal/module/e2ee/repository/postgres.go#L243) — `Backup` | Chỉ actor có quyền direct; StoreEpochBackup ON CONFLICT DO NOTHING; trả bản đã commit. |
| API trả backup của ai? | [db/queries/epochs.sql:19](./db/queries/epochs.sql#L19) — `ListEpochsForUser` | LEFT JOIN backup với user_id của actor; không trả tất cả backup của peer. |
| Mỗi tin có khóa riêng | [internal/e2ee/messages.go:26](./internal/e2ee/messages.go#L26) — `DeriveMessageKey` | HKDF từ SK và context chứa thread/epoch/message/sender/recipient; không có chain ratchet mutable. |
| AAD ràng buộc những gì? | [internal/e2ee/messages.go:9](./internal/e2ee/messages.go#L9) — `messageAAD` | ThreadID, EpochID, MessageID, SenderID, RecipientID và nhãn version. |
| AES-GCM encrypt/decrypt message | [internal/e2ee/messages.go:85](./internal/e2ee/messages.go#L85) — `SealMessage` | SealMessage/OpenMessage; DeriveMessageKey → sealRecord/openRecord với AAD. |
| AES-GCM và nonce thật sự | [internal/e2ee/records.go:38](./internal/e2ee/records.go#L38) — `sealRecord` | crypto/rand tạo nonce, newGCM.Seal; openRecord kiểm tra authentication khi mở. |
| Định dạng envelope v2 | [internal/e2ee/messages.go:60](./internal/e2ee/messages.go#L60) — `ParseMessageEnvelope` | version, epoch_id, recipient_id, nonce, ciphertext; parser strict và giới hạn độ dài. |
| Kiểu dữ liệu session/vault/envelope | [internal/e2ee/session_types.go:1](./internal/e2ee/session_types.go#L1) | KDFProfile, PasswordKeys, AccountVault, EpochHeader, MessageEnvelope và context. |
| Client bắt đầu khôi phục tài khoản | [web/e2ee.js:81](./web/e2ee.js#L81) — `start` | GET e2ee/account → WASM openAccount → account trong RAM. |
| Gửi direct từ client | [web/e2ee.js:262](./web/e2ee.js#L262) — `send` | Chọn session canonical, mã hóa, lưu UUID/envelope/body rồi _post. |
| Retry đúng ciphertext/body | [web/e2ee.js:245](./web/e2ee.js#L245) — `_post` | Dùng item.body đã lưu; kiểm tra response khớp context/content rồi mới xóa outbox. |
| Giải mã tin gửi/nhận và xác nhận pending | [web/e2ee.js:295](./web/e2ee.js#L295) — `receive` | Suy ra crypto recipient từ sender/peer, mở đúng epoch; đối chiếu payload pending. |
| recipient_id của WS có giống envelope? | [web/e2ee.js:295](./web/e2ee.js#L295) — `receive` | WS recipient_id là đích giao tới socket, có thể là chính sender; envelope recipient_id là peer mật mã. |
| Outbox browser lưu gì? | [web/e2ee-state.js:5](./web/e2ee-state.js#L5) — `outbox` | Exact ciphertext retry trong localStorage theo API origin/user; account keys/backup lấy từ API. |
| Pin fingerprint | [web/e2ee.js:100](./web/e2ee.js#L100) — `_pin` | Pin trong RAM của phiên, chưa thay thế xác minh ngoài kênh. |
| JavaScript tải WASM | [web/e2ee-wasm.js:64](./web/e2ee-wasm.js#L64) — `start` | fetch /e2ee.wasm → WebAssembly.instantiate → go.run; chờ bridge ready. |
| JavaScript gọi Go | [web/e2ee-wasm.js:33](./web/e2ee-wasm.js#L33) — `call` | Serialize JSON vào global bridge, kiểm tra result/error; crypto không được fallback plaintext. |
| Go export hàm cho JS | [cmd/e2ee-wasm/main_js.go:38](./cmd/e2ee-wasm/main_js.go#L38) — `main` | syscall/js, callbacks và global MiniHermesE2EE; main sống bằng select {}. |
| Wrapper crypto Go/WASM | [cmd/e2ee-wasm/session_js.go:327](./cmd/e2ee-wasm/session_js.go#L327) — `sealMessage` | Parse input → gọi internal/e2ee → JSON output; HTTP/DOM/state nằm ở JS. |

## 11. Toàn bộ endpoint và handler

Nguồn đăng ký route: [internal/route/router.go](./internal/route/router.go). Các route nghiệp vụ dùng middleware JWT; ba route auth bên dưới và health công khai. WS được đăng ký ở tiến trình gateway.


| Endpoint | Nhóm | Handler |
| --- | --- | --- |
| `GET /health` | Công khai | [internal/route/router.go:107](./internal/route/router.go#L107) — `healthHandler` |
| `GET /` | Giao diện / tài nguyên | [internal/route/router.go:98](./internal/route/router.go#L98) — `indexHandler` |
| `GET /e2ee.wasm` | Giao diện / tài nguyên | [internal/route/router.go:102](./internal/route/router.go#L102) — `wasmHandler` |
| `POST /auth/register` | Công khai | [internal/module/user/handler/handler.go:30](./internal/module/user/handler/handler.go#L30) — `Register` |
| `POST /auth/login` | Công khai | [internal/module/user/handler/handler.go:48](./internal/module/user/handler/handler.go#L48) — `Login` |
| `GET /auth/params` | Công khai | [internal/module/user/handler/handler.go:70](./internal/module/user/handler/handler.go#L70) — `AuthParams` |
| `GET /users` | Nghiệp vụ | [internal/module/user/handler/handler.go:85](./internal/module/user/handler/handler.go#L85) — `List` |
| `POST /auth/ws-ticket` | Nghiệp vụ | [internal/wsticket/handler.go:28](./internal/wsticket/handler.go#L28) — `Issue` |
| `GET /e2ee/account` | Nghiệp vụ | [internal/module/e2ee/handler/handler.go:36](./internal/module/e2ee/handler/handler.go#L36) — `Account` |
| `POST /e2ee/bundles/:user_id/claim` | Nghiệp vụ | [internal/module/e2ee/handler/handler.go:49](./internal/module/e2ee/handler/handler.go#L49) — `Claim` |
| `GET /threads/:id/epochs` | Nghiệp vụ | [internal/module/e2ee/handler/handler.go:66](./internal/module/e2ee/handler/handler.go#L66) — `Epochs` |
| `POST /threads/:id/epochs` | Nghiệp vụ | [internal/module/e2ee/handler/handler.go:79](./internal/module/e2ee/handler/handler.go#L79) — `CreateEpoch` |
| `PUT /threads/:id/epochs/:epoch_id/key` | Nghiệp vụ | [internal/module/e2ee/handler/handler.go:100](./internal/module/e2ee/handler/handler.go#L100) — `Backup` |
| `POST /threads/direct` | Nghiệp vụ | [internal/module/thread/handler/handler.go:36](./internal/module/thread/handler/handler.go#L36) — `CreateOrGetDirect` |
| `POST /threads/group` | Nghiệp vụ | [internal/module/thread/handler/groups.go:11](./internal/module/thread/handler/groups.go#L11) — `CreateGroup` |
| `GET /threads/:id/members` | Nghiệp vụ | [internal/module/thread/handler/groups.go:30](./internal/module/thread/handler/groups.go#L30) — `Members` |
| `POST /threads/:id/members` | Nghiệp vụ | [internal/module/thread/handler/groups.go:48](./internal/module/thread/handler/groups.go#L48) — `AddMember` |
| `DELETE /threads/:id/members/:user_id` | Nghiệp vụ | [internal/module/thread/handler/groups.go:67](./internal/module/thread/handler/groups.go#L67) — `RemoveMember` |
| `POST /threads/:id/leave` | Nghiệp vụ | [internal/module/thread/handler/groups.go:81](./internal/module/thread/handler/groups.go#L81) — `Leave` |
| `GET /threads` | Nghiệp vụ | [internal/module/thread/handler/handler.go:66](./internal/module/thread/handler/handler.go#L66) — `List` |
| `PUT /threads/:id/read` | Nghiệp vụ | [internal/module/thread/handler/handler.go:82](./internal/module/thread/handler/handler.go#L82) — `MarkRead` |
| `POST /threads/:id/messages` | Nghiệp vụ | [internal/module/message/handler/handler.go:42](./internal/module/message/handler/handler.go#L42) — `Send` |
| `GET /threads/:id/messages` | Nghiệp vụ | [internal/module/message/handler/handler.go:85](./internal/module/message/handler/handler.go#L85) — `List` |
| `GET /ws?ticket=...` hoặc Bearer header | Gateway | [internal/gateway/handler.go:31](./internal/gateway/handler.go#L31) — `ServeHTTP` |

Các static file `.js`, `.css`, `wasm_exec.js` được đăng ký bằng `StaticFile` ngay trong `route.New`. Chúng không đi qua middleware nghiệp vụ. `/e2ee.wasm` dùng `wasmHandler` để đặt MIME type.

## 12. Database, migration và sqlc

Schema cuối phải đọc theo **toàn bộ migration Up theo thứ tự**; file migration cũ có thể còn các cột đã bị migration sau loại bỏ.

| Bảng cuối | Vai trò | Mở để đối chiếu |
| --- | --- | --- |
| `users` | External UUID, username, auth_credential_hash, KDF, public bundle và encrypted account vault. | [db/migrations/20261009100000_recoverable_e2ee.sql](./db/migrations/20261009100000_recoverable_e2ee.sql) |
| `threads` | Direct/group, last_seq và current_epoch_id. | [db/queries/threads.sql](./db/queries/threads.sql) |
| `participants` | Các khoảng tham gia; role, joined_seq, left_seq, last_read_seq. | [db/queries/groups.sql](./db/queries/groups.sql) |
| `messages` | External UUID retry, thread/sender, seq, kind, format, epoch_id và content. | [db/queries/messages.sql](./db/queries/messages.sql) |
| `prekeys` | Các public OPK còn khả dụng để claim. | [db/queries/prekeys.sql](./db/queries/prekeys.sql) |
| `e2ee_epochs` | Bootstrap X3DH và định danh session, không lưu SK rõ. | [db/queries/epochs.sql](./db/queries/epochs.sql) |
| `e2ee_epoch_backups` | Bản SK mã hóa riêng theo epoch và owner user. | [db/queries/epochs.sql](./db/queries/epochs.sql) |

| Migration theo thứ tự | Nội dung |
| --- | --- |
| [db/migrations/20260918081353_create_users.sql](./db/migrations/20260918081353_create_users.sql) | Tạo users ban đầu. |
| [db/migrations/20260921113000_create_messages.sql](./db/migrations/20260921113000_create_messages.sql) | Messages ở giai đoạn đầu, chưa phải schema chat cuối. |
| [db/migrations/20260924090000_create_direct_chat_schema.sql](./db/migrations/20260924090000_create_direct_chat_schema.sql) | Tạo threads, participants, messages và prekeys; các unique/FK/index nền tảng. |
| [db/migrations/20260928090000_use_external_message_id.sql](./db/migrations/20260928090000_use_external_message_id.sql) | Bỏ direct_user_low/high_id và client_msg_id; dùng external message UUID. |
| [db/migrations/20261009090000_direct_e2ee_only.sql](./db/migrations/20261009090000_direct_e2ee_only.sql) | Bỏ encryption_mode; direct E2EE và group plaintext theo kind. |
| [db/migrations/20261009100000_recoverable_e2ee.sql](./db/migrations/20261009100000_recoverable_e2ee.sql) | Credential/vault/KDF, epoch và backup, current_epoch_id và e2ee_v2. |

**sqlc:** sửa SQL gốc ở `db/queries/`, chạy `make sqlc` theo [sqlc.yaml](./sqlc.yaml). Code sinh tự động ở `internal/database/sqlc/`; khi mentor hỏi vì sao truy vấn như vậy, mở SQL gốc trước.

Các ràng buộc cần tìm: `messages.external_id` unique; `(thread_id, seq)` unique; `participants_active_membership_key` chỉ cho một membership hoạt động; FK epoch gắn với đúng thread. Tạo direct hiện khóa user ở tầng ứng dụng thay cho unique index cặp user đã bị bỏ.

## 13. Các luồng mở code liên tiếp

Dùng các tuyến dưới đây để không bị mất phương hướng khi mentor yêu cầu đi sâu. Mỗi bước là một vị trí có thể mở.

### A. Gửi tin nhóm qua API

1. [internal/route/router.go:44](./internal/route/router.go#L44) — `New`
2. [internal/module/message/handler/handler.go:42](./internal/module/message/handler/handler.go#L42) — `Send`
3. [internal/module/message/service/service.go:67](./internal/module/message/service/service.go#L67) — `Send`
4. [internal/module/message/repository/postgres.go:25](./internal/module/message/repository/postgres.go#L25) — `Send`
5. [db/queries/messages.sql:15](./db/queries/messages.sql#L15) — `LockThreadForParticipant`
6. [db/queries/messages.sql:45](./db/queries/messages.sql#L45) — `GetMessageByExternalID`
7. [db/queries/messages.sql:64](./db/queries/messages.sql#L64) — `IncrementThreadSequence`
8. [db/queries/messages.sql:70](./db/queries/messages.sql#L70) — `CreateThreadMessage`
9. [internal/module/message/service/publish.go:21](./internal/module/message/service/publish.go#L21) — `PublishMessage`
10. [internal/module/message/publisher/redis.go:26](./internal/module/message/publisher/redis.go#L26) — `Publish`

### B. Redis tới màn hình người nhận

1. [internal/gateway/consumer.go:49](./internal/gateway/consumer.go#L49) — `consume`
2. [internal/gateway/consumer.go:97](./internal/gateway/consumer.go#L97) — `handleStreams`
3. [internal/gateway/hub.go:175](./internal/gateway/hub.go#L175) — `Dispatch`
4. [internal/gateway/hub.go:213](./internal/gateway/hub.go#L213) — `queueTo`
5. [internal/gateway/hub.go:123](./internal/gateway/hub.go#L123) — `writeLoop`
6. [web/app.js:929](./web/app.js#L929) — `handleSocketMessage`
7. [web/app.js:514](./web/app.js#L514) — `acceptMessage`
8. [web/realtime-core.js:3](./web/realtime-core.js#L3) — `merge`
9. [web/app.js:653](./web/app.js#L653) — `sortedMessages`
10. [web/app.js:669](./web/app.js#L669) — `renderMessages`

### C. Direct E2EE trước khi đi qua tuyến gửi API

1. [web/app.js:1133](./web/app.js#L1133) — `sendE2EEFromForm`
2. [web/e2ee.js:262](./web/e2ee.js#L262) — `send`
3. [web/e2ee.js:225](./web/e2ee.js#L225) — `_current`
4. [web/e2ee.js:191](./web/e2ee.js#L191) — `_createEpoch`
5. [internal/e2ee/epoch.go:121](./internal/e2ee/epoch.go#L121) — `CreateEpoch`
6. [internal/module/e2ee/repository/postgres.go:126](./internal/module/e2ee/repository/postgres.go#L126) — `CreateEpoch`
7. [internal/e2ee/messages.go:85](./internal/e2ee/messages.go#L85) — `SealMessage`
8. [web/e2ee.js:245](./web/e2ee.js#L245) — `_post`

### D. Thiết bị mới đăng nhập để đọc lại lịch sử

1. [web/e2ee.js:28](./web/e2ee.js#L28) — `deriveCredentials`
2. [internal/e2ee/account.go:50](./internal/e2ee/account.go#L50) — `DeriveCredentials`
3. [web/app.js:1505](./web/app.js#L1505) — `finishLogin`
4. [internal/module/user/service/service.go:81](./internal/module/user/service/service.go#L81) — `Login`
5. [web/e2ee.js:81](./web/e2ee.js#L81) — `start`
6. [internal/e2ee/account.go:222](./internal/e2ee/account.go#L222) — `OpenAccountVault`
7. [web/e2ee.js:138](./web/e2ee.js#L138) — `_restore`
8. [internal/e2ee/epoch.go:267](./internal/e2ee/epoch.go#L267) — `OpenEpochBackup`
9. [web/e2ee.js:295](./web/e2ee.js#L295) — `receive`
10. [internal/e2ee/messages.go:103](./internal/e2ee/messages.go#L103) — `OpenMessage`

### E. Reconnect và lấy bù

1. [web/app.js:910](./web/app.js#L910) — `scheduleReconnect`
2. [web/app.js:960](./web/app.js#L960) — `connectWebSocket`
3. [internal/wsticket/handler.go:28](./internal/wsticket/handler.go#L28) — `Issue`
4. [internal/gateway/handler.go:31](./internal/gateway/handler.go#L31) — `ServeHTTP`
5. [web/app.js:534](./web/app.js#L534) — `loadThreads`
6. [web/app.js:774](./web/app.js#L774) — `catchUpConversation`
7. [web/realtime-core.js:35](./web/realtime-core.js#L35) — `fetchThroughBoundary`
8. [internal/module/message/repository/postgres.go:167](./internal/module/message/repository/postgres.go#L167) — `List`
9. [db/queries/messages.sql:110](./db/queries/messages.sql#L110) — `ListThreadMessagesPage`

### F. Thêm/xóa/rời nhóm

1. [internal/module/thread/handler/groups.go:48](./internal/module/thread/handler/groups.go#L48) — `AddMember`
2. [internal/module/thread/service/groups.go:70](./internal/module/thread/service/groups.go#L70) — `changeMember`
3. [internal/module/thread/repository/groups.go:45](./internal/module/thread/repository/groups.go#L45) — `ChangeMember`
4. [internal/module/thread/repository/groups.go:177](./internal/module/thread/repository/groups.go#L177) — `createSystemMessage`
5. [internal/module/message/service/publish.go:21](./internal/module/message/service/publish.go#L21) — `PublishMessage`

### G. Marker và đồng bộ nhiều tab

1. [web/app.js:1084](./web/app.js#L1084) — `renderedReadSequence`
2. [web/app.js:1191](./web/app.js#L1191) — `flushReadMarker`
3. [internal/module/thread/service/service.go:92](./internal/module/thread/service/service.go#L92) — `MarkRead`
4. [internal/module/thread/repository/postgres.go:138](./internal/module/thread/repository/postgres.go#L138) — `MarkRead`
5. [db/queries/threads.sql:103](./db/queries/threads.sql#L103) — `MarkThreadRead`
6. [internal/module/thread/publisher/redis.go:24](./internal/module/thread/publisher/redis.go#L24) — `Publish`
7. [internal/gateway/hub.go:198](./internal/gateway/hub.go#L198) — `DispatchThreadUpdated`
8. [web/app.js:929](./web/app.js#L929) — `handleSocketMessage`
9. [web/app.js:534](./web/app.js#L534) — `loadThreads`

Ở tuyến C, `_current` chỉ tạo epoch khi chưa có phiên; direct đã có session sẽ khôi phục phiên canonical. Ở tuyến D, nếu recipient chưa từng lưu backup thì `_restore` đi qua `OpenEpoch` và lưu backup trước khi dùng SK. Các tuyến liệt kê vị trí đọc theo ý nghĩa, không phải mọi bước đều chạy lại ở mỗi lần gửi.

## 14. Bảy câu hỏi bảo vệ: mở đoạn nào làm bằng chứng?

| Câu hỏi | Mở bằng chứng | Điểm phải giải thích |
| --- | --- | --- |
| 1. Hai người gửi cùng lúc, thứ tự ở đâu? | [internal/module/message/repository/postgres.go:25](./internal/module/message/repository/postgres.go#L25) — `Send`; [db/queries/messages.sql:15](./db/queries/messages.sql#L15) — `LockThreadForParticipant`; [web/app.js:653](./web/app.js#L653) — `sortedMessages` | DB serialize theo thread và cấp seq trong transaction; client có thể nhận tạm thời khác thứ tự nhưng gộp/hiển thị theo seq. Không có total order giữa các thread. |
| 2. Hai gateway thì một event tới ai? | [internal/gateway/consumer.go:49](./internal/gateway/consumer.go#L49) — `consume`; [internal/gateway/hub.go:60](./internal/gateway/hub.go#L60) — `add` | Code giới hạn một instance và consumer cố định. Hai consumer khác tên cùng group chia việc, không broadcast tới mọi Hub; đổi tên consumer riêng chưa đủ sửa định tuyến. |
| 3. Crash sau WS trước XACK? | [internal/gateway/consumer.go:76](./internal/gateway/consumer.go#L76) — `recoverPending`; [internal/gateway/consumer.go:97](./internal/gateway/consumer.go#L97) — `handleStreams`; [web/realtime-core.js:3](./web/realtime-core.js#L3) — `merge` | Pending có thể replay và client thấy event lặp; UUID gộp trùng. ACK xảy ra sau queue nên cũng có thể mất realtime sau queue/ACK nếu chưa write socket; lịch sử lấy bù từ DB. |
| 4. Đọc trộm toàn DB thấy gì? | [internal/e2ee/session_types.go:1](./internal/e2ee/session_types.go#L1); [db/migrations/20261009100000_recoverable_e2ee.sql](./db/migrations/20261009100000_recoverable_e2ee.sql); [docs/adr/005-recoverable-e2ee-sessions.md](./docs/adr/005-recoverable-e2ee-sessions.md) | Thấy metadata, public keys, KDF/salt, credential hash, ciphertext/vault/backup; nhóm plaintext thấy content. Không có private key/SK rõ trong DB nhưng vẫn có bề mặt đoán mật khẩu offline; chưa có Double Ratchet. |
| 5. Nhóm 10.000 gãy ở đâu? | [internal/module/thread/model/thread.go:26](./internal/module/thread/model/thread.go#L26) — `MaxGroupMembers`; [internal/module/message/service/publish.go:38](./internal/module/message/service/publish.go#L38) — `messageRecipients`; [internal/gateway/hub.go:175](./internal/gateway/hub.go#L175) — `Dispatch` | Hiện từ chối trên 100. Nếu bỏ giới hạn, khảo sát lock thread, recipient list/serialize/stream, fanout/queue/write và unread queries. Chưa benchmark thì không kết luận chắc bước nào gãy trước. |
| 6. Vì sao publish sau commit? | [internal/module/message/service/service.go:67](./internal/module/message/service/service.go#L67) — `Send`; [internal/module/message/service/publish.go:21](./internal/module/message/service/publish.go#L21) — `PublishMessage`; [docs/adr/001-gateway-and-stream.md](./docs/adr/001-gateway-and-stream.md) | Tránh event cho tin chưa tồn tại/rollback. Vẫn có khoảng hở commit→publish; 503 và retry UUID giúp nhiều trường hợp nhưng không thay transactional outbox. |
| 7. Vì sao Argon2id? | [internal/e2ee/account.go:21](./internal/e2ee/account.go#L21) — `NewKDFProfile`; [internal/e2ee/account.go:50](./internal/e2ee/account.go#L50) — `DeriveCredentials`; [internal/module/user/service/service.go:49](./internal/module/user/service/service.go#L49) — `Register` | Chỉ ra KDF memory/time cost, salt, hai nhãn HKDF và khác biệt với bcrypt hash credential ở server. Thông số hiện tại 64 MiB/3/4. |

## 15. Test: cần chứng minh hành vi thì mở đâu?

Các mục dưới đây là **test có trong repo**, không có nghĩa mục lục này đã chạy lại toàn bộ test. Chỉ tạo tài liệu tra cứu, không sửa source hoặc thực thi test tích hợp ghi dữ liệu.

| Hành vi | Test nên mở |
| --- | --- |
| Auth credential và bcrypt/JWT | [internal/module/user/service/auth_test.go:51](./internal/module/user/service/auth_test.go#L51) — `TestDerivedCredentialRegistrationAndLogin` |
| Không nhận raw password/field mơ hồ | [internal/module/user/handler/auth_test.go:31](./internal/module/user/handler/auth_test.go#L31) — `TestAuthHandlersRejectRawPasswordAndAmbiguousCredentials` |
| Direct/create group/quyền membership | [internal/module/thread/service/service_test.go:69](./internal/module/thread/service/service_test.go#L69) — `TestCreateOrGetDirect`; [TestGroupMembership](./internal/module/thread/service/service_test.go#L296) |
| Read marker và notification | [internal/module/thread/service/service_test.go:390](./internal/module/thread/service/service_test.go#L390) — `TestMarkReadNotifications` |
| Publish sau lưu và retry giữ seq | [internal/module/message/service/service_test.go:352](./internal/module/message/service/service_test.go#L352) — `TestRetryAfterPublishFailurePublishesAgainWithoutIncrementingSequence` |
| Snapshot recipients khi membership thay đổi | [internal/module/message/service/service_test.go:593](./internal/module/message/service/service_test.go#L593) — `TestPublishMessageMembershipChangeAndOldRetry` |
| Request bị cancel sau commit | [internal/module/message/service/service_test.go:644](./internal/module/message/service/service_test.go#L644) — `TestPublishMessageAfterRequestCancellation` |
| Ticket chỉ consume một lần | [internal/wsticket/service_test.go:39](./internal/wsticket/service_test.go#L39) — `TestTicketIssueConsumeOnce` |
| Gateway fanout và ACK | [internal/gateway/consumer_test.go:127](./internal/gateway/consumer_test.go#L127) — `TestHandleStreamsNotificationFanoutAndACK` |
| Password/vault trên thiết bị mới | [internal/e2ee/session_test.go:18](./internal/e2ee/session_test.go#L18) — `TestPasswordSeparationAndPortableAccountVault` |
| Session 3DH/4DH và nhắn hai chiều | [internal/e2ee/session_test.go:119](./internal/e2ee/session_test.go#L119) — `TestEpoch3DH4DHAndStatelessReplies` |
| Tamper không được trả secret | [internal/e2ee/session_test.go:262](./internal/e2ee/session_test.go#L262) — `TestEpochAndMessageTamperingNeverReturnsSecrets` |
| Epoch concurrent winner / retry | [internal/module/e2ee/service/epochs_test.go:38](./internal/module/e2ee/service/epochs_test.go#L38) — `TestCreateEpochPreservesRetryAndConcurrentWinner` |
| HTTP epoch statuses / canonical | [internal/module/e2ee/handler/handler_test.go:57](./internal/module/e2ee/handler/handler_test.go#L57) — `TestEpochHTTPStatusesAndCanonicalWinner` |
| Tích hợp Go Postgres/Redis | [internal/route/recovery_integration_test.go:52](./internal/route/recovery_integration_test.go#L52) — `TestRecoverableE2EEIntegration` |
| Client nhiều thiết bị, UI auth, retry, read summary | [web/e2ee-client.test.cjs](./web/e2ee-client.test.cjs) |

Lệnh theo README/Makefile: `make wasm`, `make test`, `make build`, `go vet ./...`, `node --test web/e2ee-client.test.cjs`. Integration Go cần `CHAT_API_INTEGRATION=1` và Postgres/Redis/schema; integration client thật cần `CHAT_API_TEST_URL` cùng API/gateway đang chạy. Nếu mentor chỉ hỏi một hành vi, mở đúng test thay vì chạy tích hợp giữa buổi bảo vệ.

## 16. Danh mục 111 file triển khai, cấu hình, test và tài liệu

Mỗi hàng dẫn tới file và các hàm/truy vấn khai báo trong đó. File test liệt kê các hàm Test; file kiểu dữ liệu liệt kê type khi không có hàm. Dùng `Ctrl + F` trong tài liệu để tìm tên file hoặc symbol.

Trong `web/app.js`, các event listener dạng anonymous không có tên hàm riêng; vị trí form đăng ký/đăng nhập/gửi tin đã có trong các bảng phía trên. Các method object ngắn bên trong outbox/loader đọc ngay trong file tương ứng.

### Entrypoint, cấu hình và công cụ

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [Makefile](./Makefile) | Lệnh run/gateway/wasm/test/build/migration/sqlc. | — |
| [README.md](./README.md) | Cách chạy, API, test và hướng đọc tài liệu. | — |
| [cmd/e2ee-wasm/main_js.go](./cmd/e2ee-wasm/main_js.go) | Export bridge syscall/js, định dạng lỗi/output, parse input. | [main (L38)](./cmd/e2ee-wasm/main_js.go#L38); [response (L70)](./cmd/e2ee-wasm/main_js.go#L70); [object (L98)](./cmd/e2ee-wasm/main_js.go#L98); [text (L135)](./cmd/e2ee-wasm/main_js.go#L135); [isNull (L143)](./cmd/e2ee-wasm/main_js.go#L143); [key32 (L145)](./cmd/e2ee-wasm/main_js.go#L145); [keyPair (L160)](./cmd/e2ee-wasm/main_js.go#L160); [bundle (L180)](./cmd/e2ee-wasm/main_js.go#L180); [digest (L203)](./cmd/e2ee-wasm/main_js.go#L203); [fingerprint (L208)](./cmd/e2ee-wasm/main_js.go#L208) |
| [cmd/e2ee-wasm/session_js.go](./cmd/e2ee-wasm/session_js.go) | Wrapper các thao tác crypto account/epoch/message cho JS. | [kdfProfile (L12)](./cmd/e2ee-wasm/session_js.go#L12); [publicUpload (L26)](./cmd/e2ee-wasm/session_js.go#L26); [encryptedRecord (L53)](./cmd/e2ee-wasm/session_js.go#L53); [createAccount (L67)](./cmd/e2ee-wasm/session_js.go#L67); [deriveCredentials (L102)](./cmd/e2ee-wasm/session_js.go#L102); [openAccount (L127)](./cmd/e2ee-wasm/session_js.go#L127); [epochContextInput (L160)](./cmd/e2ee-wasm/session_js.go#L160); [epochHeaderInput (L171)](./cmd/e2ee-wasm/session_js.go#L171); [epochData (L179)](./cmd/e2ee-wasm/session_js.go#L179); [createEpoch (L184)](./cmd/e2ee-wasm/session_js.go#L184); [openEpoch (L216)](./cmd/e2ee-wasm/session_js.go#L216); [encryptEpochBackup (L256)](./cmd/e2ee-wasm/session_js.go#L256); [decryptEpochBackup (L286)](./cmd/e2ee-wasm/session_js.go#L286); [messageContextInput (L316)](./cmd/e2ee-wasm/session_js.go#L316); [sealMessage (L327)](./cmd/e2ee-wasm/session_js.go#L327); [openMessage (L356)](./cmd/e2ee-wasm/session_js.go#L356) |
| [cmd/main.go](./cmd/main.go) | Entry point HTTP API và ghép dependency. | [main (L32)](./cmd/main.go#L32); [run (L38)](./cmd/main.go#L38) |
| [cmd/ws-gateway/main.go](./cmd/ws-gateway/main.go) | Entry point gateway, consumer goroutine và shutdown. | [main (L20)](./cmd/ws-gateway/main.go#L20); [run (L26)](./cmd/ws-gateway/main.go#L26); [serve (L58)](./cmd/ws-gateway/main.go#L58) |
| [config/config.go](./config/config.go) | Đọc YAML, defaults và validate cấu hình. | [LoadGateway (L26)](./config/config.go#L26); [Load (L58)](./config/config.go#L58); [validateShared (L84)](./config/config.go#L84); [applyWSDefaults (L113)](./config/config.go#L113) |
| [config/config.yml.example](./config/config.yml.example) | Cấu hình mẫu API, gateway, DB, JWT và Redis. | — |
| [docker-compose.yml](./docker-compose.yml) | Postgres và Redis local. | — |
| [go.mod](./go.mod) | Module/toolchain và dependency trực tiếp/gián tiếp. | — |
| [go.sum](./go.sum) | Checksum dependency. | — |
| [sqlc.yaml](./sqlc.yaml) | Cấu hình nguồn SQL/schema và output Go. | — |

### User, JWT và middleware

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [internal/middleware/auth.go](./internal/middleware/auth.go) | Bearer JWT middleware và lấy actor. | [RequireAuthentication (L16)](./internal/middleware/auth.go#L16); [AuthenticatedUserID (L35)](./internal/middleware/auth.go#L35); [abortUnauthorized (L45)](./internal/middleware/auth.go#L45) |
| [internal/module/user/dto/user.go](./internal/module/user/dto/user.go) | JSON request/response và chuyển model module user. | [UnmarshalJSON (L27)](./internal/module/user/dto/user.go#L27); [UnmarshalJSON (L37)](./internal/module/user/dto/user.go#L37); [decodeRequest (L48)](./internal/module/user/dto/user.go#L48); [ToUserResponse (L101)](./internal/module/user/dto/user.go#L101); [ToUserSummaryResponses (L109)](./internal/module/user/dto/user.go#L109) |
| [internal/module/user/handler/auth_test.go](./internal/module/user/handler/auth_test.go) | Test module/user/handler/auth. | [TestAuthHandlersRejectRawPasswordAndAmbiguousCredentials (L31)](./internal/module/user/handler/auth_test.go#L31) |
| [internal/module/user/handler/handler.go](./internal/module/user/handler/handler.go) | HTTP handlers module user và ánh xạ lỗi. | [New (L26)](./internal/module/user/handler/handler.go#L26); [Register (L30)](./internal/module/user/handler/handler.go#L30); [Login (L48)](./internal/module/user/handler/handler.go#L48); [AuthParams (L70)](./internal/module/user/handler/handler.go#L70); [List (L85)](./internal/module/user/handler/handler.go#L85); [writeError (L95)](./internal/module/user/handler/handler.go#L95) |
| [internal/module/user/model/errors.go](./internal/module/user/model/errors.go) | Lỗi nghiệp vụ của module user. | — |
| [internal/module/user/model/user.go](./internal/module/user/model/user.go) | Model nội bộ module user. | [User (L9)](./internal/module/user/model/user.go#L9); [Credentials (L16)](./internal/module/user/model/user.go#L16); [AccountRegistration (L21)](./internal/module/user/model/user.go#L21); [AuthParams (L29)](./internal/module/user/model/user.go#L29); [LoginResult (L34)](./internal/module/user/model/user.go#L34) |
| [internal/module/user/model/username.go](./internal/module/user/model/username.go) | Chuẩn hóa/validate username. | [NormalizeUsername (L5)](./internal/module/user/model/username.go#L5) |
| [internal/module/user/repository/postgres.go](./internal/module/user/repository/postgres.go) | Truy cập PostgreSQL/transaction module user. | [New (L22)](./internal/module/user/repository/postgres.go#L22); [CreateAccount (L26)](./internal/module/user/repository/postgres.go#L26); [GetAuthParamsByUsername (L79)](./internal/module/user/repository/postgres.go#L79); [GetCredentialsByUsername (L94)](./internal/module/user/repository/postgres.go#L94); [GetByExternalID (L113)](./internal/module/user/repository/postgres.go#L113); [List (L132)](./internal/module/user/repository/postgres.go#L132); [toModel (L146)](./internal/module/user/repository/postgres.go#L146) |
| [internal/module/user/service/auth_test.go](./internal/module/user/service/auth_test.go) | Test module/user/service/auth. | [TestDerivedCredentialRegistrationAndLogin (L51)](./internal/module/user/service/auth_test.go#L51); [TestRegistrationRejectsInvalidRecoveryDataBeforeDatabase (L104)](./internal/module/user/service/auth_test.go#L104); [TestAuthParamsNormalizesUsernameAndReturnsStoredProfile (L137)](./internal/module/user/service/auth_test.go#L137) |
| [internal/module/user/service/service.go](./internal/module/user/service/service.go) | Nghiệp vụ module user, interface và dependency. | [New (L30)](./internal/module/user/service/service.go#L30); [GetByExternalID (L37)](./internal/module/user/service/service.go#L37); [List (L45)](./internal/module/user/service/service.go#L45); [Register (L49)](./internal/module/user/service/service.go#L49); [AuthParams (L73)](./internal/module/user/service/service.go#L73); [Login (L81)](./internal/module/user/service/service.go#L81); [validAuthCredential (L111)](./internal/module/user/service/service.go#L111) |
| [internal/module/user/service/service_test.go](./internal/module/user/service/service_test.go) | Test module/user/service/service. | [TestGetByExternalID (L48)](./internal/module/user/service/service_test.go#L48); [TestList (L158)](./internal/module/user/service/service_test.go#L158) |
| [internal/token/jwt.go](./internal/token/jwt.go) | JWT HS256 tự tạo/xác minh. | [NewJWT (L37)](./internal/token/jwt.go#L37); [Create (L51)](./internal/token/jwt.go#L51); [Verify (L78)](./internal/token/jwt.go#L78); [sign (L120)](./internal/token/jwt.go#L120) |

### Thread và nhóm

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [internal/module/thread/dto/thread.go](./internal/module/thread/dto/thread.go) | JSON request/response và chuyển model module thread. | [ToThreadResponse (L66)](./internal/module/thread/dto/thread.go#L66); [ToThreadResponses (L96)](./internal/module/thread/dto/thread.go#L96) |
| [internal/module/thread/event/event.go](./internal/module/thread/event/event.go) | Contract thread.updated. | [ThreadUpdated (L6)](./internal/module/thread/event/event.go#L6) |
| [internal/module/thread/handler/groups.go](./internal/module/thread/handler/groups.go) | HTTP tạo nhóm và quản lý thành viên. | [CreateGroup (L11)](./internal/module/thread/handler/groups.go#L11); [Members (L30)](./internal/module/thread/handler/groups.go#L30); [AddMember (L48)](./internal/module/thread/handler/groups.go#L48); [RemoveMember (L67)](./internal/module/thread/handler/groups.go#L67); [Leave (L81)](./internal/module/thread/handler/groups.go#L81) |
| [internal/module/thread/handler/handler.go](./internal/module/thread/handler/handler.go) | HTTP handlers module thread và ánh xạ lỗi. | [New (L32)](./internal/module/thread/handler/handler.go#L32); [CreateOrGetDirect (L36)](./internal/module/thread/handler/handler.go#L36); [List (L66)](./internal/module/thread/handler/handler.go#L66); [MarkRead (L82)](./internal/module/thread/handler/handler.go#L82); [authenticatedUserID (L117)](./internal/module/thread/handler/handler.go#L117); [writeError (L121)](./internal/module/thread/handler/handler.go#L121) |
| [internal/module/thread/membership/redis.go](./internal/module/thread/membership/redis.go) | Cache snapshot membership bất biến, TTL và kiểm tra dữ liệu. | [NewRedis (L27)](./internal/module/thread/membership/redis.go#L27); [key (L31)](./internal/module/thread/membership/redis.go#L31); [Get (L36)](./internal/module/thread/membership/redis.go#L36); [Put (L62)](./internal/module/thread/membership/redis.go#L62) |
| [internal/module/thread/model/errors.go](./internal/module/thread/model/errors.go) | Lỗi nghiệp vụ của module thread. | — |
| [internal/module/thread/model/thread.go](./internal/module/thread/model/thread.go) | Model nội bộ module thread. | [Peer (L5)](./internal/module/thread/model/thread.go#L5); [ReadResult (L12)](./internal/module/thread/model/thread.go#L12); [LastMessage (L18)](./internal/module/thread/model/thread.go#L18); [Thread (L28)](./internal/module/thread/model/thread.go#L28); [Member (L45)](./internal/module/thread/model/thread.go#L45); [MembershipAction (L53)](./internal/module/thread/model/thread.go#L53) |
| [internal/module/thread/publisher/redis.go](./internal/module/thread/publisher/redis.go) | XADD read notification thread.updated. | [NewRedis (L20)](./internal/module/thread/publisher/redis.go#L20); [Publish (L24)](./internal/module/thread/publisher/redis.go#L24) |
| [internal/module/thread/publisher/redis_test.go](./internal/module/thread/publisher/redis_test.go) | Test module/thread/publisher/redis. | [TestPublishThreadUpdated (L27)](./internal/module/thread/publisher/redis_test.go#L27) |
| [internal/module/thread/repository/groups.go](./internal/module/thread/repository/groups.go) | Transaction nhóm/membership, quyền admin và system message. | [CreateGroup (L14)](./internal/module/thread/repository/groups.go#L14); [ChangeMember (L45)](./internal/module/thread/repository/groups.go#L45); [ListMembers (L140)](./internal/module/thread/repository/groups.go#L140); [createSystemMessage (L177)](./internal/module/thread/repository/groups.go#L177); [systemMessageAt (L189)](./internal/module/thread/repository/groups.go#L189); [systemMessageFromRow (L197)](./internal/module/thread/repository/groups.go#L197) |
| [internal/module/thread/repository/postgres.go](./internal/module/thread/repository/postgres.go) | Truy cập PostgreSQL/transaction module thread. | [New (L21)](./internal/module/thread/repository/postgres.go#L21); [CreateOrGetDirect (L25)](./internal/module/thread/repository/postgres.go#L25); [ListByUser (L103)](./internal/module/thread/repository/postgres.go#L103); [threadFromRow (L117)](./internal/module/thread/repository/postgres.go#L117); [MarkRead (L138)](./internal/module/thread/repository/postgres.go#L138); [parseThreadUUID (L181)](./internal/module/thread/repository/postgres.go#L181) |
| [internal/module/thread/service/groups.go](./internal/module/thread/service/groups.go) | Validate nghiệp vụ nhóm và publish system message. | [CreateGroup (L12)](./internal/module/thread/service/groups.go#L12); [AddMember (L58)](./internal/module/thread/service/groups.go#L58); [RemoveMember (L62)](./internal/module/thread/service/groups.go#L62); [Leave (L66)](./internal/module/thread/service/groups.go#L66); [changeMember (L70)](./internal/module/thread/service/groups.go#L70); [Members (L107)](./internal/module/thread/service/groups.go#L107) |
| [internal/module/thread/service/service.go](./internal/module/thread/service/service.go) | Nghiệp vụ module thread, interface và dependency. | [New (L44)](./internal/module/thread/service/service.go#L44); [CreateOrGetDirect (L48)](./internal/module/thread/service/service.go#L48); [List (L75)](./internal/module/thread/service/service.go#L75); [MarkRead (L92)](./internal/module/thread/service/service.go#L92) |
| [internal/module/thread/service/service_test.go](./internal/module/thread/service/service_test.go) | Test module/thread/service/service. | [TestCreateOrGetDirect (L69)](./internal/module/thread/service/service_test.go#L69); [TestMarkRead (L152)](./internal/module/thread/service/service_test.go#L152); [TestCreateGroup (L226)](./internal/module/thread/service/service_test.go#L226); [TestGroupMembership (L296)](./internal/module/thread/service/service_test.go#L296); [TestGroupMembers (L362)](./internal/module/thread/service/service_test.go#L362); [TestMarkReadNotifications (L390)](./internal/module/thread/service/service_test.go#L390); [TestMarkReadNotificationTimeout (L465)](./internal/module/thread/service/service_test.go#L465) |

### Message

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [internal/module/message/dto/message.go](./internal/module/message/dto/message.go) | JSON request/response và chuyển model module message. | [ToMessageResponse (L31)](./internal/module/message/dto/message.go#L31); [ToMessageResponses (L44)](./internal/module/message/dto/message.go#L44); [ToMessagePageResponse (L53)](./internal/module/message/dto/message.go#L53) |
| [internal/module/message/event/event.go](./internal/module/message/event/event.go) | Contract message.created và chuyển từ model. | [FromMessage (L24)](./internal/module/message/event/event.go#L24) |
| [internal/module/message/handler/handler.go](./internal/module/message/handler/handler.go) | HTTP handlers module message và ánh xạ lỗi. | [New (L38)](./internal/module/message/handler/handler.go#L38); [Send (L42)](./internal/module/message/handler/handler.go#L42); [List (L85)](./internal/module/message/handler/handler.go#L85); [listQuery (L113)](./internal/module/message/handler/handler.go#L113); [authenticatedUserID (L143)](./internal/module/message/handler/handler.go#L143); [writeError (L147)](./internal/module/message/handler/handler.go#L147) |
| [internal/module/message/model/errors.go](./internal/module/message/model/errors.go) | Lỗi nghiệp vụ của module message. | [Error (L32)](./internal/module/message/model/errors.go#L32); [Unwrap (L41)](./internal/module/message/model/errors.go#L41) |
| [internal/module/message/model/message.go](./internal/module/message/model/message.go) | Model nội bộ module message. | [Message (L5)](./internal/module/message/model/message.go#L5); [Page (L18)](./internal/module/message/model/message.go#L18) |
| [internal/module/message/publisher/redis.go](./internal/module/message/publisher/redis.go) | XADD message.created. | [NewRedis (L22)](./internal/module/message/publisher/redis.go#L22); [Publish (L26)](./internal/module/message/publisher/redis.go#L26) |
| [internal/module/message/repository/postgres.go](./internal/module/message/repository/postgres.go) | Truy cập PostgreSQL/transaction module message. | [New (L21)](./internal/module/message/repository/postgres.go#L21); [Send (L25)](./internal/module/message/repository/postgres.go#L25); [validateEnvelopeHeader (L133)](./internal/module/message/repository/postgres.go#L133); [List (L167)](./internal/module/message/repository/postgres.go#L167); [classifyThreadAccess (L225)](./internal/module/message/repository/postgres.go#L225); [parseUUID (L236)](./internal/module/message/repository/postgres.go#L236); [messageFromValues (L244)](./internal/module/message/repository/postgres.go#L244); [isExternalIDUniqueViolation (L265)](./internal/module/message/repository/postgres.go#L265); [MembershipVersionAtSequence (L273)](./internal/module/message/repository/postgres.go#L273); [ListMemberIDsAtSequence (L283)](./internal/module/message/repository/postgres.go#L283) |
| [internal/module/message/service/publish.go](./internal/module/message/service/publish.go) | Publish sau commit và snapshot/cache recipients. | [PublishMessage (L21)](./internal/module/message/service/publish.go#L21); [messageRecipients (L38)](./internal/module/message/service/publish.go#L38) |
| [internal/module/message/service/service.go](./internal/module/message/service/service.go) | Nghiệp vụ module message, interface và dependency. | [New (L51)](./internal/module/message/service/service.go#L51); [Send (L67)](./internal/module/message/service/service.go#L67); [List (L114)](./internal/module/message/service/service.go#L114) |
| [internal/module/message/service/service_test.go](./internal/module/message/service/service_test.go) | Test module/message/service/service. | [TestSendGroupPlaintext (L97)](./internal/module/message/service/service_test.go#L97); [TestList (L186)](./internal/module/message/service/service_test.go#L186); [TestSendPersistenceAndPublishing (L243)](./internal/module/message/service/service_test.go#L243); [TestRetryAfterPublishFailurePublishesAgainWithoutIncrementingSequence (L352)](./internal/module/message/service/service_test.go#L352); [TestSendE2EEValidationAndOpaquePublishing (L430)](./internal/module/message/service/service_test.go#L430); [TestE2EERetryAfterPublishFailureKeepsExactPayload (L477)](./internal/module/message/service/service_test.go#L477); [TestPublishMessageSnapshots (L527)](./internal/module/message/service/service_test.go#L527); [TestPublishMessageMembershipChangeAndOldRetry (L593)](./internal/module/message/service/service_test.go#L593); [TestPublishMessageAfterRequestCancellation (L644)](./internal/module/message/service/service_test.go#L644) |

### E2EE API và crypto

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [internal/e2ee/account.go](./internal/e2ee/account.go) | KDF/credential, account vault và public bundle. | [NewKDFProfile (L21)](./internal/e2ee/account.go#L21); [ValidateKDFProfile (L30)](./internal/e2ee/account.go#L30); [NormalizeAccountUsername (L41)](./internal/e2ee/account.go#L41); [DeriveCredentials (L50)](./internal/e2ee/account.go#L50); [EncodePrivateKeyPair (L79)](./internal/e2ee/account.go#L79); [DecodePrivateKeyPair (L84)](./internal/e2ee/account.go#L84); [GenerateAccountVault (L101)](./internal/e2ee/account.go#L101); [PublicBundleFromVault (L129)](./internal/e2ee/account.go#L129); [canonicalPublicBundle (L139)](./internal/e2ee/account.go#L139); [ValidatePublicBundle (L146)](./internal/e2ee/account.go#L146); [ValidateAccountVault (L164)](./internal/e2ee/account.go#L164); [vaultAAD (L187)](./internal/e2ee/account.go#L187); [EncryptAccountVault (L206)](./internal/e2ee/account.go#L206); [OpenAccountVault (L222)](./internal/e2ee/account.go#L222); [validateVaultWire (L245)](./internal/e2ee/account.go#L245) |
| [internal/e2ee/crypto.go](./internal/e2ee/crypto.go) | Primitive X25519, signature, HKDF, AES-GCM, validators. | [GenerateKeyPair (L36)](./internal/e2ee/crypto.go#L36); [ValidatePublicKey (L49)](./internal/e2ee/crypto.go#L49); [SignPrekey (L63)](./internal/e2ee/crypto.go#L63); [VerifyBundle (L72)](./internal/e2ee/crypto.go#L72); [verifyPrekeyBundle (L79)](./internal/e2ee/crypto.go#L79); [verifySignature (L109)](./internal/e2ee/crypto.go#L109); [decode64 (L115)](./internal/e2ee/crypto.go#L115); [publicKey (L126)](./internal/e2ee/crypto.go#L126); [encodePublic (L135)](./internal/e2ee/crypto.go#L135); [validatePair (L139)](./internal/e2ee/crypto.go#L139); [canonicalUUID (L147)](./internal/e2ee/crypto.go#L147); [validatePlaintext (L155)](./internal/e2ee/crypto.go#L155); [deriveKey (L163)](./internal/e2ee/crypto.go#L163); [newGCM (L193)](./internal/e2ee/crypto.go#L193) |
| [internal/e2ee/crypto_test.go](./internal/e2ee/crypto_test.go) | Test primitives và profile cũ/hồi quy; xem session_test.go cho phiên v2 hiện tại. | [TestRFCVectors (L66)](./internal/e2ee/crypto_test.go#L66); [TestMessages3DH4DHAndReverse (L124)](./internal/e2ee/crypto_test.go#L124); [TestAADByteLayout (L188)](./internal/e2ee/crypto_test.go#L188); [TestSignatureAndBundleValidation (L210)](./internal/e2ee/crypto_test.go#L210); [TestConcurrentSignAndVerify (L247)](./internal/e2ee/crypto_test.go#L247); [TestTamperingFailsWithoutOutput (L264)](./internal/e2ee/crypto_test.go#L264); [TestLowOrderAndMalformedEnvelope (L320)](./internal/e2ee/crypto_test.go#L320); [TestPlaintextAndContextValidation (L393)](./internal/e2ee/crypto_test.go#L393) |
| [internal/e2ee/epoch.go](./internal/e2ee/epoch.go) | X3DH fixed session, confirmation và encrypted backup. | [validateEpochContext (L15)](./internal/e2ee/epoch.go#L15); [epochContext (L27)](./internal/e2ee/epoch.go#L27); [epochAAD (L33)](./internal/e2ee/epoch.go#L33); [ValidateEpochHeader (L60)](./internal/e2ee/epoch.go#L60); [ParseEpochHeader (L73)](./internal/e2ee/epoch.go#L73); [EncodeEpochHeader (L89)](./internal/e2ee/epoch.go#L89); [EpochHeaderDigest (L100)](./internal/e2ee/epoch.go#L100); [confirmationKey (L109)](./internal/e2ee/epoch.go#L109); [CreateEpoch (L121)](./internal/e2ee/epoch.go#L121); [VerifyEpoch (L169)](./internal/e2ee/epoch.go#L169); [OpenEpoch (L190)](./internal/e2ee/epoch.go#L190); [backupAAD (L221)](./internal/e2ee/epoch.go#L221); [epochBackupKey (L239)](./internal/e2ee/epoch.go#L239); [EncryptEpochBackup (L251)](./internal/e2ee/epoch.go#L251); [OpenEpochBackup (L267)](./internal/e2ee/epoch.go#L267) |
| [internal/e2ee/legacy_v1_test.go](./internal/e2ee/legacy_v1_test.go) | Helper profile X3DH từng message cũ, chỉ dùng hồi quy trong test. | [ParseEnvelope (L30)](./internal/e2ee/legacy_v1_test.go#L30); [EncodeEnvelope (L77)](./internal/e2ee/legacy_v1_test.go#L77); [Seal (L90)](./internal/e2ee/legacy_v1_test.go#L90); [Open (L143)](./internal/e2ee/legacy_v1_test.go#L143); [DecryptWithKey (L173)](./internal/e2ee/legacy_v1_test.go#L173); [validateContext (L205)](./internal/e2ee/legacy_v1_test.go#L205); [validateEnvelope (L214)](./internal/e2ee/legacy_v1_test.go#L214); [makeAAD (L240)](./internal/e2ee/legacy_v1_test.go#L240) |
| [internal/e2ee/messages.go](./internal/e2ee/messages.go) | Context/AAD, KDF từng tin, envelope và encrypt/decrypt. | [messageAAD (L9)](./internal/e2ee/messages.go#L9); [DeriveMessageKey (L26)](./internal/e2ee/messages.go#L26); [ValidateMessageEnvelope (L42)](./internal/e2ee/messages.go#L42); [ParseMessageEnvelope (L60)](./internal/e2ee/messages.go#L60); [EncodeMessageEnvelope (L74)](./internal/e2ee/messages.go#L74); [SealMessage (L85)](./internal/e2ee/messages.go#L85); [OpenMessage (L103)](./internal/e2ee/messages.go#L103) |
| [internal/e2ee/records.go](./internal/e2ee/records.go) | EncryptedRecord codec và AES-GCM seal/open. | [ValidateEncryptedRecord (L14)](./internal/e2ee/records.go#L14); [canonicalCiphertext (L27)](./internal/e2ee/records.go#L27); [sealRecord (L38)](./internal/e2ee/records.go#L38); [openRecord (L54)](./internal/e2ee/records.go#L54); [decodeExact (L75)](./internal/e2ee/records.go#L75) |
| [internal/e2ee/session_test.go](./internal/e2ee/session_test.go) | Test KDF/vault, session cố định, backup và message v2. | [TestPasswordSeparationAndPortableAccountVault (L18)](./internal/e2ee/session_test.go#L18); [TestKDFRejectsUnapprovedProfilesBeforeWork (L101)](./internal/e2ee/session_test.go#L101); [TestEpoch3DH4DHAndStatelessReplies (L119)](./internal/e2ee/session_test.go#L119); [TestEpochBackupsRestoreBothOwnersAndBindHeader (L189)](./internal/e2ee/session_test.go#L189); [TestMessageKDFIndependentByteLayout (L235)](./internal/e2ee/session_test.go#L235); [TestEpochAndMessageTamperingNeverReturnsSecrets (L262)](./internal/e2ee/session_test.go#L262); [TestV2WireStrictnessAndCanonicalBootstrapHash (L323)](./internal/e2ee/session_test.go#L323) |
| [internal/e2ee/session_types.go](./internal/e2ee/session_types.go) | Kiểu KDF, account vault, epoch và message v2. | [KDFProfile (L5)](./internal/e2ee/session_types.go#L5); [PasswordKeys (L14)](./internal/e2ee/session_types.go#L14); [EncryptedRecord (L19)](./internal/e2ee/session_types.go#L19); [PrivateKeyPair (L25)](./internal/e2ee/session_types.go#L25); [VaultSignedPrekey (L30)](./internal/e2ee/session_types.go#L30); [VaultOneTimePrekey (L36)](./internal/e2ee/session_types.go#L36); [AccountVault (L43)](./internal/e2ee/session_types.go#L43); [EpochContext (L50)](./internal/e2ee/session_types.go#L50); [EpochHeader (L57)](./internal/e2ee/session_types.go#L57); [EpochMessageContext (L72)](./internal/e2ee/session_types.go#L72); [MessageEnvelope (L80)](./internal/e2ee/session_types.go#L80) |
| [internal/e2ee/types.go](./internal/e2ee/types.go) | Kiểu key pair và public bundle/prekeys. | [KeyPair (L6)](./internal/e2ee/types.go#L6); [PublicPrekey (L11)](./internal/e2ee/types.go#L11); [SignedPrekey (L16)](./internal/e2ee/types.go#L16); [UploadRequest (L22)](./internal/e2ee/types.go#L22); [ClaimRequest (L28)](./internal/e2ee/types.go#L28); [Bundle (L32)](./internal/e2ee/types.go#L32) |
| [internal/module/e2ee/dto/prekeys.go](./internal/module/e2ee/dto/prekeys.go) | JSON request/response và chuyển model module e2ee. | [Error (L49)](./internal/module/e2ee/dto/prekeys.go#L49); [Unwrap (L50)](./internal/module/e2ee/dto/prekeys.go#L50) |
| [internal/module/e2ee/handler/handler.go](./internal/module/e2ee/handler/handler.go) | HTTP handlers module e2ee và ánh xạ lỗi. | [New (L34)](./internal/module/e2ee/handler/handler.go#L34); [Account (L36)](./internal/module/e2ee/handler/handler.go#L36); [Claim (L49)](./internal/module/e2ee/handler/handler.go#L49); [Epochs (L66)](./internal/module/e2ee/handler/handler.go#L66); [CreateEpoch (L79)](./internal/module/e2ee/handler/handler.go#L79); [Backup (L100)](./internal/module/e2ee/handler/handler.go#L100); [authenticatedActor (L117)](./internal/module/e2ee/handler/handler.go#L117); [readJSON (L128)](./internal/module/e2ee/handler/handler.go#L128); [object (L154)](./internal/module/e2ee/handler/handler.go#L154); [writeError (L195)](./internal/module/e2ee/handler/handler.go#L195) |
| [internal/module/e2ee/handler/handler_test.go](./internal/module/e2ee/handler/handler_test.go) | Test module/e2ee/handler/handler. | [TestEpochHTTPStatusesAndCanonicalWinner (L57)](./internal/module/e2ee/handler/handler_test.go#L57); [TestEpochHTTPRejectsAmbiguousOrSecretFields (L94)](./internal/module/e2ee/handler/handler_test.go#L94) |
| [internal/module/e2ee/model/errors.go](./internal/module/e2ee/model/errors.go) | Lỗi nghiệp vụ của module e2ee. | — |
| [internal/module/e2ee/repository/postgres.go](./internal/module/e2ee/repository/postgres.go) | Truy cập PostgreSQL/transaction module e2ee. | [New (L22)](./internal/module/e2ee/repository/postgres.go#L22); [Account (L24)](./internal/module/e2ee/repository/postgres.go#L24); [Claim (L40)](./internal/module/e2ee/repository/postgres.go#L40); [Epochs (L94)](./internal/module/e2ee/repository/postgres.go#L94); [CreateEpoch (L126)](./internal/module/e2ee/repository/postgres.go#L126); [Backup (L243)](./internal/module/e2ee/repository/postgres.go#L243); [epochResponse (L285)](./internal/module/e2ee/repository/postgres.go#L285); [threadError (L296)](./internal/module/e2ee/repository/postgres.go#L296); [parseUUID (L310)](./internal/module/e2ee/repository/postgres.go#L310) |
| [internal/module/e2ee/service/epochs_test.go](./internal/module/e2ee/service/epochs_test.go) | Test module/e2ee/service/epochs. | [TestCreateEpochPreservesRetryAndConcurrentWinner (L38)](./internal/module/e2ee/service/epochs_test.go#L38); [TestEpochValidationRejectsMismatchedContextBeforePersistence (L71)](./internal/module/e2ee/service/epochs_test.go#L71); [TestRecoveryReturnsOnlyCommittedAccountAndBackup (L106)](./internal/module/e2ee/service/epochs_test.go#L106) |
| [internal/module/e2ee/service/service.go](./internal/module/e2ee/service/service.go) | Nghiệp vụ module e2ee, interface và dependency. | [New (L33)](./internal/module/e2ee/service/service.go#L33); [actor (L37)](./internal/module/e2ee/service/service.go#L37); [Account (L48)](./internal/module/e2ee/service/service.go#L48); [Claim (L60)](./internal/module/e2ee/service/service.go#L60); [Epochs (L88)](./internal/module/e2ee/service/service.go#L88); [CreateEpoch (L109)](./internal/module/e2ee/service/service.go#L109); [Backup (L132)](./internal/module/e2ee/service/service.go#L132); [canonicalUUID (L151)](./internal/module/e2ee/service/service.go#L151) |
| [internal/module/e2ee/service/service_test.go](./internal/module/e2ee/service/service_test.go) | Test module/e2ee/service/service. | [TestClaimValidationAndSelfClaim (L85)](./internal/module/e2ee/service/service_test.go#L85); [TestClaimPassesContextAndRepositoryBundle (L113)](./internal/module/e2ee/service/service_test.go#L113); [TestClaimAccessAndRepositoryErrors (L157)](./internal/module/e2ee/service/service_test.go#L157) |

### Gateway, ticket và route

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [internal/gateway/consumer.go](./internal/gateway/consumer.go) | Consumer Stream, pending, decode và ACK. | [NewConsumer (L32)](./internal/gateway/consumer.go#L32); [Run (L36)](./internal/gateway/consumer.go#L36); [consume (L49)](./internal/gateway/consumer.go#L49); [recoverPending (L76)](./internal/gateway/consumer.go#L76); [handleStreams (L97)](./internal/gateway/consumer.go#L97); [decode (L130)](./internal/gateway/consumer.go#L130); [decodeThreadUpdated (L150)](./internal/gateway/consumer.go#L150); [validPublicUUID (L174)](./internal/gateway/consumer.go#L174); [decodeMessageCreated (L179)](./internal/gateway/consumer.go#L179) |
| [internal/gateway/consumer_test.go](./internal/gateway/consumer_test.go) | Test gateway/consumer. | [TestDecodeThreadUpdated (L35)](./internal/gateway/consumer_test.go#L35); [TestDecodeMessageCreatedCompatibility (L68)](./internal/gateway/consumer_test.go#L68); [TestHandleStreamsNotificationFanoutAndACK (L127)](./internal/gateway/consumer_test.go#L127); [TestHandleStreamsPoisonACKAndCancellation (L161)](./internal/gateway/consumer_test.go#L161); [TestDispatchMessageCreatedPayload (L179)](./internal/gateway/consumer_test.go#L179) |
| [internal/gateway/handler.go](./internal/gateway/handler.go) | Xác thực và upgrade WS. | [NewHandler (L27)](./internal/gateway/handler.go#L27); [ServeHTTP (L31)](./internal/gateway/handler.go#L31); [authenticate (L71)](./internal/gateway/handler.go#L71) |
| [internal/gateway/hub.go](./internal/gateway/hub.go) | Map socket, queue, fanout, heartbeat và stop. | [NewHub (L40)](./internal/gateway/hub.go#L40); [begin (L50)](./internal/gateway/hub.go#L50); [add (L60)](./internal/gateway/hub.go#L60); [Stop (L81)](./internal/gateway/hub.go#L81); [remove (L110)](./internal/gateway/hub.go#L110); [writeLoop (L123)](./internal/gateway/hub.go#L123); [Dispatch (L175)](./internal/gateway/hub.go#L175); [dispatchTo (L184)](./internal/gateway/hub.go#L184); [DispatchThreadUpdated (L198)](./internal/gateway/hub.go#L198); [queueTo (L213)](./internal/gateway/hub.go#L213) |
| [internal/route/recovery_integration_test.go](./internal/route/recovery_integration_test.go) | Test route/recovery_integration. | [TestRecoverableE2EEIntegration (L52)](./internal/route/recovery_integration_test.go#L52) |
| [internal/route/router.go](./internal/route/router.go) | Đăng ký API/static routes và middleware. | [New (L44)](./internal/route/router.go#L44); [indexHandler (L98)](./internal/route/router.go#L98); [wasmHandler (L102)](./internal/route/router.go#L102); [healthHandler (L107)](./internal/route/router.go#L107); [noMethodHandler (L111)](./internal/route/router.go#L111) |
| [internal/wsticket/handler.go](./internal/wsticket/handler.go) | HTTP xin vé WS. | [NewHandler (L24)](./internal/wsticket/handler.go#L24); [Issue (L28)](./internal/wsticket/handler.go#L28) |
| [internal/wsticket/redis.go](./internal/wsticket/redis.go) | SetNX TTL và GetDel ticket. | [NewRedisRepository (L17)](./internal/wsticket/redis.go#L17); [Store (L21)](./internal/wsticket/redis.go#L21); [Consume (L26)](./internal/wsticket/redis.go#L26) |
| [internal/wsticket/service.go](./internal/wsticket/service.go) | Sinh/kiểm tra ticket và user ID. | [NewService (L26)](./internal/wsticket/service.go#L26); [Issue (L30)](./internal/wsticket/service.go#L30); [Consume (L52)](./internal/wsticket/service.go#L52) |
| [internal/wsticket/service_test.go](./internal/wsticket/service_test.go) | Test wsticket/service. | [TestTicketIssueConsumeOnce (L39)](./internal/wsticket/service_test.go#L39); [TestIssueRejectsNonUUIDSubject (L62)](./internal/wsticket/service_test.go#L62) |

### SQL gốc, migrations và code sinh

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [db/migrations/20260918081353_create_users.sql](./db/migrations/20260918081353_create_users.sql) | Tạo users ban đầu. | — |
| [db/migrations/20260921113000_create_messages.sql](./db/migrations/20260921113000_create_messages.sql) | Messages ở giai đoạn đầu, chưa phải schema chat cuối. | — |
| [db/migrations/20260924090000_create_direct_chat_schema.sql](./db/migrations/20260924090000_create_direct_chat_schema.sql) | Tạo threads, participants, messages và prekeys; các unique/FK/index nền tảng. | — |
| [db/migrations/20260928090000_use_external_message_id.sql](./db/migrations/20260928090000_use_external_message_id.sql) | Bỏ direct_user_low/high_id và client_msg_id; dùng external message UUID. | — |
| [db/migrations/20261009090000_direct_e2ee_only.sql](./db/migrations/20261009090000_direct_e2ee_only.sql) | Bỏ encryption_mode; direct E2EE và group plaintext theo kind. | — |
| [db/migrations/20261009100000_recoverable_e2ee.sql](./db/migrations/20261009100000_recoverable_e2ee.sql) | Credential/vault/KDF, epoch và backup, current_epoch_id và e2ee_v2. | — |
| [db/queries/epochs.sql](./db/queries/epochs.sql) | SQL session, backup và quyền theo actor. | [GetEpochThreadForParticipant (L1)](./db/queries/epochs.sql#L1); [LockEpochThreadForParticipant (L7)](./db/queries/epochs.sql#L7); [GetEpochParticipantProfiles (L14)](./db/queries/epochs.sql#L14); [ListEpochsForUser (L19)](./db/queries/epochs.sql#L19); [GetEpochForUser (L30)](./db/queries/epochs.sql#L30); [CreateEpoch (L41)](./db/queries/epochs.sql#L41); [SetCurrentEpoch (L45)](./db/queries/epochs.sql#L45); [StoreEpochBackup (L48)](./db/queries/epochs.sql#L48); [GetEpochIdentity (L53)](./db/queries/epochs.sql#L53) |
| [db/queries/groups.sql](./db/queries/groups.sql) | SQL group/membership/admin/system message. | [CreateGroupThread (L1)](./db/queries/groups.sql#L1); [LockThreadByExternalID (L6)](./db/queries/groups.sql#L6); [GetActiveParticipant (L12)](./db/queries/groups.sql#L12); [GetLatestMembership (L18)](./db/queries/groups.sql#L18); [CreateGroupParticipant (L25)](./db/queries/groups.sql#L25); [EndParticipant (L30)](./db/queries/groups.sql#L30); [CountActiveGroupMembers (L35)](./db/queries/groups.sql#L35); [ListGroupMembers (L41)](./db/queries/groups.sql#L41); [PromoteOldestGroupMember (L53)](./db/queries/groups.sql#L53); [CreateSystemMessage (L65)](./db/queries/groups.sql#L65); [GetThreadMessageAtSequence (L80)](./db/queries/groups.sql#L80) |
| [db/queries/messages.sql](./db/queries/messages.sql) | SQL lock/seq/retry/history và snapshot membership. | [ThreadExistsByExternalID (L1)](./db/queries/messages.sql#L1); [GetThreadHistoryAccess (L6)](./db/queries/messages.sql#L6); [LockThreadForParticipant (L15)](./db/queries/messages.sql#L15); [ListMemberIDsAtSequence (L25)](./db/queries/messages.sql#L25); [GetMembershipVersion (L35)](./db/queries/messages.sql#L35); [GetMessageByExternalID (L45)](./db/queries/messages.sql#L45); [IncrementThreadSequence (L64)](./db/queries/messages.sql#L64); [CreateThreadMessage (L70)](./db/queries/messages.sql#L70); [ListThreadMessagesPage (L110)](./db/queries/messages.sql#L110); [GetE2EEMessageParticipants (L140)](./db/queries/messages.sql#L140) |
| [db/queries/prekeys.sql](./db/queries/prekeys.sql) | SQL claim và consume public OPK. | [LockE2EEUser (L1)](./db/queries/prekeys.sql#L1); [InsertE2EEOneTimePrekey (L4)](./db/queries/prekeys.sql#L4); [GetE2EEClaimThread (L8)](./db/queries/prekeys.sql#L8); [GetE2EEClaimParticipants (L11)](./db/queries/prekeys.sql#L11); [ConsumeE2EEOneTimePrekey (L15)](./db/queries/prekeys.sql#L15) |
| [db/queries/threads.sql](./db/queries/threads.sql) | SQL direct, summaries, unread và read marker. | [CreateDirectThread (L1)](./db/queries/threads.sql#L1); [LockUsersForDirectThread (L6)](./db/queries/threads.sql#L6); [GetDirectThreadByParticipants (L13)](./db/queries/threads.sql#L13); [CreateParticipant (L27)](./db/queries/threads.sql#L27); [GetThreadSummaryForUser (L31)](./db/queries/threads.sql#L31); [ListThreadsForUser (L67)](./db/queries/threads.sql#L67); [MarkThreadRead (L103)](./db/queries/threads.sql#L103) |
| [db/queries/users.sql](./db/queries/users.sql) | SQL account/auth và user lookup. | [CreateUserAccount (L1)](./db/queries/users.sql#L1); [GetUserCredentialsByUsername (L7)](./db/queries/users.sql#L7); [GetAuthParamsByUsername (L12)](./db/queries/users.sql#L12); [GetUserAccount (L15)](./db/queries/users.sql#L15); [GetUserByExternalID (L19)](./db/queries/users.sql#L19); [ListUsers (L24)](./db/queries/users.sql#L24) |
| [internal/database/sqlc/db.go](./internal/database/sqlc/db.go) | Mã sinh sqlc: DBTX, Queries và WithTx. | [New (L20)](./internal/database/sqlc/db.go#L20); [WithTx (L28)](./internal/database/sqlc/db.go#L28) |
| [internal/database/sqlc/epochs.sql.go](./internal/database/sqlc/epochs.sql.go) | Mã sinh tự động từ db/queries/epochs.sql. | [CreateEpoch (L27)](./internal/database/sqlc/epochs.sql.go#L27); [GetEpochForUser (L65)](./internal/database/sqlc/epochs.sql.go#L65); [GetEpochIdentity (L88)](./internal/database/sqlc/epochs.sql.go#L88); [GetEpochParticipantProfiles (L107)](./internal/database/sqlc/epochs.sql.go#L107); [GetEpochThreadForParticipant (L145)](./internal/database/sqlc/epochs.sql.go#L145); [ListEpochsForUser (L178)](./internal/database/sqlc/epochs.sql.go#L178); [LockEpochThreadForParticipant (L224)](./internal/database/sqlc/epochs.sql.go#L224); [SetCurrentEpoch (L240)](./internal/database/sqlc/epochs.sql.go#L240); [StoreEpochBackup (L257)](./internal/database/sqlc/epochs.sql.go#L257) |
| [internal/database/sqlc/groups.sql.go](./internal/database/sqlc/groups.sql.go) | Mã sinh tự động từ db/queries/groups.sql. | [CountActiveGroupMembers (L26)](./internal/database/sqlc/groups.sql.go#L26); [CreateGroupParticipant (L46)](./internal/database/sqlc/groups.sql.go#L46); [CreateGroupThread (L72)](./internal/database/sqlc/groups.sql.go#L72); [CreateSystemMessage (L115)](./internal/database/sqlc/groups.sql.go#L115); [EndParticipant (L149)](./internal/database/sqlc/groups.sql.go#L149); [GetActiveParticipant (L173)](./internal/database/sqlc/groups.sql.go#L173); [GetLatestMembership (L204)](./internal/database/sqlc/groups.sql.go#L204); [GetThreadMessageAtSequence (L239)](./internal/database/sqlc/groups.sql.go#L239); [ListGroupMembers (L283)](./internal/database/sqlc/groups.sql.go#L283); [LockThreadByExternalID (L323)](./internal/database/sqlc/groups.sql.go#L323); [PromoteOldestGroupMember (L348)](./internal/database/sqlc/groups.sql.go#L348) |
| [internal/database/sqlc/messages.sql.go](./internal/database/sqlc/messages.sql.go) | Mã sinh tự động từ db/queries/messages.sql. | [CreateThreadMessage (L78)](./internal/database/sqlc/messages.sql.go#L78); [GetE2EEMessageParticipants (L117)](./internal/database/sqlc/messages.sql.go#L117); [GetMembershipVersion (L153)](./internal/database/sqlc/messages.sql.go#L153); [GetMessageByExternalID (L195)](./internal/database/sqlc/messages.sql.go#L195); [GetThreadHistoryAccess (L230)](./internal/database/sqlc/messages.sql.go#L230); [IncrementThreadSequence (L244)](./internal/database/sqlc/messages.sql.go#L244); [ListMemberIDsAtSequence (L267)](./internal/database/sqlc/messages.sql.go#L267); [ListThreadMessagesPage (L338)](./internal/database/sqlc/messages.sql.go#L338); [LockThreadForParticipant (L395)](./internal/database/sqlc/messages.sql.go#L395); [ThreadExistsByExternalID (L408)](./internal/database/sqlc/messages.sql.go#L408) |
| [internal/database/sqlc/models.go](./internal/database/sqlc/models.go) | Mã sinh sqlc: row models theo schema. | [E2eeEpoch (L11)](./internal/database/sqlc/models.go#L11); [E2eeEpochBackup (L20)](./internal/database/sqlc/models.go#L20); [Message (L26)](./internal/database/sqlc/models.go#L26); [Participant (L40)](./internal/database/sqlc/models.go#L40); [Prekey (L52)](./internal/database/sqlc/models.go#L52); [Thread (L60)](./internal/database/sqlc/models.go#L60); [User (L71)](./internal/database/sqlc/models.go#L71) |
| [internal/database/sqlc/prekeys.sql.go](./internal/database/sqlc/prekeys.sql.go) | Mã sinh tự động từ db/queries/prekeys.sql. | [ConsumeE2EEOneTimePrekey (L29)](./internal/database/sqlc/prekeys.sql.go#L29); [GetE2EEClaimParticipants (L41)](./internal/database/sqlc/prekeys.sql.go#L41); [GetE2EEClaimThread (L70)](./internal/database/sqlc/prekeys.sql.go#L70); [InsertE2EEOneTimePrekey (L88)](./internal/database/sqlc/prekeys.sql.go#L88); [LockE2EEUser (L103)](./internal/database/sqlc/prekeys.sql.go#L103) |
| [internal/database/sqlc/threads.sql.go](./internal/database/sqlc/threads.sql.go) | Mã sinh tự động từ db/queries/threads.sql. | [CreateDirectThread (L25)](./internal/database/sqlc/threads.sql.go#L25); [CreateParticipant (L42)](./internal/database/sqlc/threads.sql.go#L42); [GetDirectThreadByParticipants (L67)](./internal/database/sqlc/threads.sql.go#L67); [GetThreadSummaryForUser (L137)](./internal/database/sqlc/threads.sql.go#L137); [ListThreadsForUser (L221)](./internal/database/sqlc/threads.sql.go#L221); [LockUsersForDirectThread (L279)](./internal/database/sqlc/threads.sql.go#L279); [MarkThreadRead (L318)](./internal/database/sqlc/threads.sql.go#L318) |
| [internal/database/sqlc/users.sql.go](./internal/database/sqlc/users.sql.go) | Mã sinh tự động từ db/queries/users.sql. | [CreateUserAccount (L36)](./internal/database/sqlc/users.sql.go#L36); [GetAuthParamsByUsername (L63)](./internal/database/sqlc/users.sql.go#L63); [GetUserAccount (L84)](./internal/database/sqlc/users.sql.go#L84); [GetUserByExternalID (L111)](./internal/database/sqlc/users.sql.go#L111); [GetUserCredentialsByUsername (L137)](./internal/database/sqlc/users.sql.go#L137); [ListUsers (L163)](./internal/database/sqlc/users.sql.go#L163) |

### Frontend

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [web/app.js](./web/app.js) | Controller UI: auth, threads, nhóm, history, WS, read marker và rendering. | [showNotice (L73)](./web/app.js#L73); [errorMessage (L77)](./web/app.js#L77); [showError (L98)](./web/app.js#L98); [canUseThread (L103)](./web/app.js#L103); [hasEncryptedMessages (L106)](./web/app.js#L106); [canSendPlaintext (L115)](./web/app.js#L115); [canSendE2EE (L118)](./web/app.js#L118); [renderE2EEPanel (L121)](./web/app.js#L121); [startE2EE (L142)](./web/app.js#L142); [updateSendButton (L165)](./web/app.js#L165); [validGroupContent (L177)](./web/app.js#L177); [renderThreadHeading (L183)](./web/app.js#L183); [decodeSubject (L202)](./web/app.js#L202); [readResponse (L208)](./web/app.js#L208); [apiRequest (L218)](./web/app.js#L218); [sendMessageWithRetry (L234)](./web/app.js#L234); [resetConversation (L249)](./web/app.js#L249); [clearSession (L266)](./web/app.js#L266); [showChatView (L314)](./web/app.js#L314); [currentSessionMatches (L320)](./web/app.js#L320); [conversationSnapshot (L323)](./web/app.js#L323); [newThreadCache (L326)](./web/app.js#L326); [cacheForThread (L337)](./web/app.js#L337); [cacheSnapshot (L341)](./web/app.js#L341); [cacheSnapshotMatches (L345)](./web/app.js#L345); [currentConversationMatches (L349)](./web/app.js#L349); [membershipSnapshotMatches (L353)](./web/app.js#L353); [peerByID (L356)](./web/app.js#L356); [threadTitle (L357)](./web/app.js#L357); [directThreadForPeer (L358)](./web/app.js#L358); [renderPeerList (L362)](./web/app.js#L362); [loadUsers (L407)](./web/app.js#L407); [receivedMessage (L442)](./web/app.js#L442); [reconcileThreadSummary (L445)](./web/app.js#L445); [deactivateGroup (L482)](./web/app.js#L482); [updateThreadFromMessage (L490)](./web/app.js#L490); [acceptMessage (L514)](./web/app.js#L514); [scheduleThreadSummaryRefresh (L526)](./web/app.js#L526); [loadThreads (L534)](./web/app.js#L534); [displayName (L592)](./web/app.js#L592); [mergeMessages (L599)](./web/app.js#L599); [processE2EEMessages (L621)](./web/app.js#L621); [sortedMessages (L653)](./web/app.js#L653); [highestMessageSeq (L657)](./web/app.js#L657); [atConversationBottom (L665)](./web/app.js#L665); [renderMessages (L669)](./web/app.js#L669); [pageURL (L730)](./web/app.js#L730); [loadInitialHistory (L738)](./web/app.js#L738); [catchUpConversation (L774)](./web/app.js#L774); [syncCurrentConversation (L816)](./web/app.js#L816); [stopWebSocket (L828)](./web/app.js#L828); [clearSocketHealthTimer (L850)](./web/app.js#L850); [armSocketTimeout (L857)](./web/app.js#L857); [restartWebSocket (L872)](./web/app.js#L872); [ensureWebSocket (L885)](./web/app.js#L885); [scheduleReconnect (L910)](./web/app.js#L910); [handleSocketMessage (L929)](./web/app.js#L929); [connectWebSocket (L960)](./web/app.js#L960); [loadOlderMessages (L1048)](./web/app.js#L1048); [renderedReadSequence (L1084)](./web/app.js#L1084); [markConversationRead (L1117)](./web/app.js#L1117); [scheduleReadMarker (L1124)](./web/app.js#L1124); [sendE2EEFromForm (L1133)](./web/app.js#L1133); [runE2EEAction (L1163)](./web/app.js#L1163); [retryE2EE (L1179)](./web/app.js#L1179); [flushReadMarker (L1191)](./web/app.js#L1191); [openThread (L1249)](./web/app.js#L1249); [openDirect (L1273)](./web/app.js#L1273); [renderMembers (L1306)](./web/app.js#L1306); [loadMembers (L1338)](./web/app.js#L1338); [changeMembership (L1365)](./web/app.js#L1365); [recoverCreatedGroup (L1400)](./web/app.js#L1400); [setAuthBusy (L1477)](./web/app.js#L1477); [readSessionValue (L1482)](./web/app.js#L1482); [cacheSession (L1485)](./web/app.js#L1485); [restoreAuthenticatedSession (L1493)](./web/app.js#L1493); [finishLogin (L1505)](./web/app.js#L1505) |
| [web/e2ee-client.test.cjs](./web/e2ee-client.test.cjs) | Client fixture với crypto thật, UI và HTTP integration tùy cấu hình. | — |
| [web/e2ee-state.js](./web/e2ee-state.js) | Outbox ciphertext retry tại browser. | [outbox (L5)](./web/e2ee-state.js#L5) |
| [web/e2ee-wasm.js](./web/e2ee-wasm.js) | Tải và kiểm tra Go/WASM bridge, gọi crypto. | [failure (L21)](./web/e2ee-wasm.js#L21); [bridgeReady (L28)](./web/e2ee-wasm.js#L28); [call (L33)](./web/e2ee-wasm.js#L33); [start (L64)](./web/e2ee-wasm.js#L64) |
| [web/e2ee.js](./web/e2ee.js) | Điều phối vault/session/crypto, exact retry và nhận tin ở browser. | [assert (L13)](./web/e2ee.js#L13); [runtime (L16)](./web/e2ee.js#L16); [assert (L17)](./web/e2ee.js#L17); [createAccount (L21)](./web/e2ee.js#L21); [deriveCredentials (L28)](./web/e2ee.js#L28); [constructor (L34)](./web/e2ee.js#L34); [_live (L57)](./web/e2ee.js#L57); [_check (L58)](./web/e2ee.js#L58); [_notify (L59)](./web/e2ee.js#L59); [_request (L60)](./web/e2ee.js#L60); [_crypto (L66)](./web/e2ee.js#L66); [snapshot (L71)](./web/e2ee.js#L71); [canRead (L76)](./web/e2ee.js#L76); [_threadValid (L77)](./web/e2ee.js#L77); [canSend (L80)](./web/e2ee.js#L80); [start (L81)](./web/e2ee.js#L81); [_pin (L100)](./web/e2ee.js#L100); [_header (L106)](./web/e2ee.js#L106); [_list (L119)](./web/e2ee.js#L119); [_restore (L138)](./web/e2ee.js#L138); [_epoch (L185)](./web/e2ee.js#L185); [_createEpoch (L191)](./web/e2ee.js#L191); [_current (L225)](./web/e2ee.js#L225); [_pending (L235)](./web/e2ee.js#L235); [_post (L245)](./web/e2ee.js#L245); [send (L262)](./web/e2ee.js#L262); [retry (L285)](./web/e2ee.js#L285); [receive (L295)](./web/e2ee.js#L295); [close (L321)](./web/e2ee.js#L321) |
| [web/index.html](./web/index.html) | DOM forms/panels và thứ tự nạp script. | — |
| [web/realtime-core.js](./web/realtime-core.js) | Gộp UUID/seq và duyệt history qua cursor, dùng chung với test. | [merge (L3)](./web/realtime-core.js#L3); [fetchThroughBoundary (L35)](./web/realtime-core.js#L35) |
| [web/style.css](./web/style.css) | Giao diện và responsive. | — |

### Tài liệu thiết kế

| File | Vai trò | Hàm / query / type |
| --- | --- | --- |
| [docs/adr/001-gateway-and-stream.md](./docs/adr/001-gateway-and-stream.md) | Quyết định tách gateway và Redis Streams. | — |
| [docs/adr/002-unread-count.md](./docs/adr/002-unread-count.md) | Quyết định unread/read marker và nhiều tab. | — |
| [docs/adr/003-message-order.md](./docs/adr/003-message-order.md) | Quyết định thứ tự, retry và history. | — |
| [docs/adr/004-e2ee-without-double-ratchet.md](./docs/adr/004-e2ee-without-double-ratchet.md) | Thiết kế E2EE cũ, đã được ADR 005 thay thế. | — |
| [docs/adr/005-recoverable-e2ee-sessions.md](./docs/adr/005-recoverable-e2ee-sessions.md) | Thiết kế E2EE hiện tại: fixed session và khôi phục. | — |
| [docs/chat-api-erd.md](./docs/chat-api-erd.md) | ERD và ràng buộc schema. | — |
| [docs/project-flows.md](./docs/project-flows.md) | Luồng nghiệp vụ/realtime/E2EE và dữ liệu client. | — |

## 17. Cách dùng ngay trước buổi bảo vệ

Ghim các tab: `cmd/main.go`, `internal/route/router.go`, message service/repository, `db/queries/messages.sql`, message publisher, gateway consumer/hub, `web/e2ee.js` và `internal/e2ee/messages.go`.

Tập ba yêu cầu ngẫu nhiên: “mở đoạn chống trùng tin”, “mở đoạn crash rồi đọc lại pending”, “mở đoạn khôi phục lịch sử E2EE trên máy mới”. Tìm bằng mục 1 trước, rồi lần theo mục 13.

Nếu mentor hỏi một nhánh chưa nhớ: “Em mở từ điểm vào chức năng rồi lần xuống hàm xử lý để chỉ đúng điều kiện ạ.” Khi trả lời, chỉ rõ **đầu vào → kiểm tra → thay đổi dữ liệu → lỗi/kết quả**, và phân biệt hành vi đã triển khai với phương án mở rộng.
