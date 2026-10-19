# Mini-Hermes Chat API

Mini-Hermes gồm hai tiến trình Go: HTTP API xử lý nghiệp vụ và lưu PostgreSQL; gateway nhận sự kiện qua Redis Streams rồi phát WebSocket. Direct (chat hai người) dùng mã hóa đầu cuối E2EE tại browser qua Go/WASM; nhóm lưu và truyền plaintext.

Mỗi direct khởi tạo X3DH một lần, dùng phiên khóa cố định và dẫn xuất khóa riêng cho từng tin. Đúng username/mật khẩu cho phép khôi phục khóa và lịch sử trên tab, thiết bị hoặc phiên ẩn danh mới; nhiều thiết bị có thể hoạt động đồng thời. Quyết định và giới hạn nằm trong [ADR 005](docs/adr/005-recoverable-e2ee-sessions.md).

## Chạy toàn bộ bằng Docker

Đây là cách đơn giản nhất và chỉ yêu cầu Docker Desktop có Docker Compose v2. Không cần cài Go, Goose, GNU Make, Node.js, PostgreSQL hay Redis trên máy. Lần chạy đầu tiên vẫn cần Internet để Docker tải image và Go module trong quá trình build.

Tại thư mục dự án, chạy:

```powershell
Set-Location 'D:\DATA\Visual\Project_IT4409'
docker compose up --build -d
```

Compose sẽ tự build API, WebSocket gateway và E2EE WebAssembly; chờ PostgreSQL/Redis sẵn sàng; chạy migration; sau đó khởi động ứng dụng. Ciphertext của tệp đính kèm được giữ trong volume `attachment_data`, vì vậy vẫn còn khi container API được tạo lại.

Kiểm tra trạng thái, log và API:

```powershell
docker compose ps
docker compose logs -f api gateway migrate
Invoke-RestMethod http://localhost:8080/health
```

Khi health endpoint trả `{"status":"ok"}`, mở `http://localhost:8080`.

Compose có JWT secret mặc định chỉ dành cho local. Khi cần đặt secret riêng, dùng cùng một giá trị cho API và gateway thông qua biến sau:

```powershell
$env:MINI_HERMES_JWT_SECRET = 'thay-bang-secret-ngau-nhien-dai-cua-ban'
docker compose up --build -d
```

Khởi động lại không cần build:

```powershell
docker compose up -d
```

Dừng và giữ dữ liệu PostgreSQL:

```powershell
docker compose down
```

Chỉ khi muốn xóa toàn bộ dữ liệu local:

```powershell
docker compose down -v
```

Lệnh `down -v` xóa cả PostgreSQL và tệp đính kèm. Hãy sao lưu hai volume trước khi dùng trong môi trường có dữ liệu cần giữ.

## Chạy local bằng công cụ trên máy

Cần Go theo [go.mod](go.mod), Docker Compose, GNU Make và `goose` trên PATH. Node.js có `fetch` và WebSocket dùng cho kiểm thử client. `sqlc` chỉ cần khi sinh lại mã truy vấn. Browser cần secure context, WebAssembly và `crypto.randomUUID`; `localhost` đáp ứng secure context.

Tại thư mục repository, chạy bằng PowerShell:

```powershell
Copy-Item config/config.yml.example config/config.yml
# Đổi auth.jwt_secret trong config/config.yml thành secret ngẫu nhiên trước khi chạy.
make up
$env:DATABASE_URL = 'postgres://chat:chat@localhost:5432/chat_api?sslmode=disable'
make migrate
make wasm
```

Mở hai terminal tại repository:

```powershell
# Terminal API
make run
```

```powershell
# Terminal gateway
make gateway
```

Mở `http://localhost:8080`, đăng ký A/B trên hai profile trình duyệt rồi chat. Đăng ký tự tạo và sao lưu khóa, không cần upload bundle thủ công. Có thể dùng `go run ./cmd` và `go run ./cmd/ws-gateway` thay cho hai target chạy server.

API/gateway đọc `config/config.yml`; `DATABASE_URL` chỉ truyền cho migration. Nếu thay database URL, sửa cả config và biến môi trường. `make migrate-status` xem phiên bản schema; `make sqlc` sinh lại truy vấn. Target `wasm` có nhánh Windows/PowerShell, tạo `web/e2ee.wasm` và `web/wasm_exec.js` từ cùng Go toolchain. Khi đổi host, cập nhật `ws_public_url`, `ws_allowed_origins`; dùng HTTPS/WSS ngoài localhost.

### Reset dữ liệu local (tùy chọn)

Chỉ reset database phát triển khi cần xóa fixture hoặc nâng tài khoản/schema cũ không có encrypted vault. Database mới không cần reset mỗi lần chạy. Migration `20261009100000` yêu cầu tài khoản cũ đã được xóa, không chuyển đổi khóa tự động; migration `down` không phục hồi dữ liệu bị xóa.

Dừng API/gateway. Với schema hiện tại và Docker Compose mặc định:

```powershell
docker compose exec -T postgres psql -U chat -d chat_api -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE messages, participants, threads, prekeys, users, e2ee_epochs, e2ee_epoch_backups RESTART IDENTITY CASCADE;"
make migrate

# Dùng đúng redis.stream và redis.database trong config; dưới đây là cấu hình mẫu.
$chatStream = 'mini-hermes:events'
docker compose exec -T redis redis-cli -n 0 DEL $chatStream
docker compose exec -T redis redis-cli -n 0 --scan --pattern "${chatStream}:membership:*" | ForEach-Object { docker compose exec -T redis redis-cli -n 0 DEL $_ }
docker compose exec -T redis redis-cli -n 0 --scan --pattern 'mini-hermes:ws-ticket:*' | ForEach-Object { docker compose exec -T redis redis-cli -n 0 DEL $_ }
```

Nếu nâng schema cũ chưa có bảng epoch, truncate năm bảng `messages, participants, threads, prekeys, users` với `RESTART IDENTITY CASCADE` trước `make migrate`. Chỉ xóa Redis key của dự án. Gateway tạo lại consumer group khi khởi động. Đăng xuất rồi đăng ký lại; tài khoản mới có UUID mới nên không sử dụng outbox của tài khoản đã xóa.

## HTTP API

Các endpoint nghiệp vụ yêu cầu `Authorization: Bearer <access_token>`; `/health` và ba endpoint auth đầu tiên công khai. Actor lấy từ JWT `sub`, không lấy từ body. Auth chỉ nhận credential dẫn xuất, không nhận mật khẩu gốc. Router: [`route.New`](internal/route/router.go).

| Method | Path | Chức năng / request chính |
| --- | --- | --- |
| `GET` | `/health` | `{"status":"ok"}` |
| `GET` | `/auth/params?username=...` | Username chuẩn hóa và KDF công khai |
| `POST` | `/auth/register` | `username`, `auth_credential`, `kdf`, `public_bundle`, `account_vault` |
| `POST` | `/auth/login` | `username`, `auth_credential`; trả JWT, `token_type`, `user_id` |
| `GET` | `/users` | Danh sách tài khoản |
| `POST` | `/auth/ws-ticket` | Vé WebSocket một lần và URL gateway |
| `GET` | `/e2ee/account` | Vault và public bundle gốc của actor |
| `POST` | `/threads/direct` | Tạo/mở direct bằng `peer_id` |
| `POST` | `/threads/group` | Tạo nhóm bằng `name`, `member_ids` |
| `GET` | `/threads` | Summary các thread đang tham gia, read marker và unread |
| `GET` | `/threads/:id/members` | Thành viên nhóm |
| `POST` | `/threads/:id/members` | Admin thêm `user_id` |
| `DELETE` | `/threads/:id/members/:user_id` | Admin xóa người khác |
| `POST` | `/threads/:id/leave` | Rời nhóm |
| `POST` | `/e2ee/bundles/:user_id/claim` | Claim bundle peer; body `thread_id` |
| `GET` | `/threads/:id/epochs` | Bootstrap, backup của actor và `current_epoch_id` |
| `POST` | `/threads/:id/epochs` | Khởi tạo phiên cố định: `epoch_id`, `bootstrap`, `key_backup` |
| `PUT` | `/threads/:id/epochs/:epoch_id/key` | Lưu backup; trả bản đã commit |
| `GET` | `/threads/:id/messages` | Lịch sử với `before_seq`, `limit` |
| `POST` | `/threads/:id/messages` | `message_id`, `content_format`, `content`, tùy chọn `attachment_ids` |
| `POST` | `/threads/:id/attachments` | Upload một ciphertext multipart trường `file`, tối đa 20 MiB + tag GCM |
| `GET` | `/attachments/:id/content` | Tải ciphertext sau khi kiểm tra quyền xem tin nhắn |
| `PUT` | `/threads/:id/read` | Tăng `last_read_seq` |

Gateway nhận `GET /ws?ticket=...`; client ngoài browser cũng có thể dùng Bearer JWT trong header. Claim/epoch APIs chỉ áp dụng cho direct. Payload mật mã được giải thích tại [luồng E2EE](docs/project-flows.md#e2ee-phiên-cố-định-và-khôi-phục).

Tệp direct được mã hóa AES-256-GCM ngay trong browser bằng khóa/IV mới cho từng tệp. Server chỉ nhận ciphertext; tên, MIME, khóa và IV nằm trong nội dung tin nhắn E2EE. Bản hiện tại chưa cho gửi tệp trong nhóm vì nhóm vẫn dùng plaintext. Tệp upload nhưng chưa gắn vào tin nhắn được đánh dấu `pending` và dọn sau 24 giờ.

## Sơ đồ sequence tóm tắt

Tin được lưu trước khi phát realtime. WebSocket bao gồm các thiết bị của sender; client gộp UUID và lấy bù REST khi thiếu tin.

```mermaid
sequenceDiagram
    participant C as Browser
    participant A as API / PostgreSQL
    participant R as Redis Stream
    participant G as Gateway
    C->>A: POST messages với UUID và payload
    A->>A: Kiểm tra quyền, khóa thread, tăng seq, commit
    A->>R: message.created và snapshot recipient_ids
    R->>G: XREADGROUP
    G-->>C: WebSocket tới mọi kết nối của các bên
    G->>R: XACK sau xử lý
    A-->>C: Message đã lưu
```

Thay đổi thành viên nhóm và system message dùng chung transaction và thứ tự `seq` với tin text.

```mermaid
sequenceDiagram
    participant C as Thành viên / admin
    participant A as API / PostgreSQL
    participant G as Redis / gateway
    C->>A: Tạo nhóm, thêm, xóa hoặc rời
    A->>A: Kiểm tra role và cập nhật membership
    A->>A: Tạo system message, commit
    A->>G: message.created tại seq của system message
    G-->>C: Realtime, client tải lại summary / members
```

Các bước chi tiết, X3DH và phục hồi nằm trong [tài liệu luồng](docs/project-flows.md).

## Kiểm tra

Unit test Go và client fixture không cần dịch vụ đang chạy. Build WASM trước fixture test; fixture dùng crypto Go/WASM thật và API mô phỏng. Phần HTTP thật của bộ client được bỏ qua khi chưa đặt `CHAT_API_TEST_URL`.

```powershell
make wasm
make test
make build
go vet ./...
node --test web/e2ee-client.test.cjs
```

Integration Go cần PostgreSQL/Redis local và schema đã migrate; bài test tự tạo HTTP server nên không cần tiến trình API/gateway đang chạy:

```powershell
$env:CHAT_API_INTEGRATION = '1'
go test ./internal/route -count=1
Remove-Item Env:CHAT_API_INTEGRATION
```

Integration client cần cả PostgreSQL, Redis, API và gateway đang chạy:

```powershell
$env:CHAT_API_TEST_URL = 'http://localhost:8080'
node --test web/e2ee-client.test.cjs
Remove-Item Env:CHAT_API_TEST_URL
```

Các bài tích hợp tạo tài khoản/nhóm thử trong database phát triển. Chúng kiểm tra khởi tạo đồng thời, phiên cố định, nhiều thiết bị, recipient offline, khôi phục từ client trống, retry cùng UUID/seq và HTTP/Redis/WebSocket. Có thể dùng [reset tùy chọn](#reset-dữ-liệu-local-tùy-chọn) sau kiểm thử.

Kiểm tra nhanh trên giao diện:

1. A/B đăng ký ở hai profile, mở direct và gửi hai chiều; reload và đăng nhập B bằng mật khẩu trên profile mới để đọc lại cả tin gửi/nhận.
2. A tạo nhóm với B; thêm, xóa rồi thêm lại B. B chỉ đọc lịch sử thuộc các lần tham gia; khi admin rời, thành viên còn lại sớm nhất được chuyển quyền nếu cần.
3. Ngắt mạng B, gửi từ A rồi nối lại; tin thiếu được lấy bù, không lặp UUID. Khởi động lại gateway để kiểm tra reconnect.
4. Mở hai tab B; đọc thread ở tab đang hiển thị và ở cuối chat, theo dõi unread ở tab còn lại. Direct A nhận summary về marker của B mà không có tin mới.
5. Đăng ký C sau khi A đã mở web, dùng nút “Làm mới danh sách” để thấy C. Với nhóm, thử tin bị từ chối rồi sửa và gửi; lỗi mạng giữ bản gửi lại cho đến khi được xác nhận.

## Tài liệu

Đọc theo thứ tự:

1. [Luồng dự án](docs/project-flows.md): kiến trúc, nghiệp vụ, realtime, E2EE và dữ liệu client.
2. [ERD](docs/chat-api-erd.md): schema, quan hệ và ràng buộc.
3. Các quyết định: [ADR 001 — gateway/Stream](docs/adr/001-gateway-and-stream.md), [ADR 002 — unread/read marker](docs/adr/002-unread-count.md), [ADR 003 — thứ tự/retry](docs/adr/003-message-order.md), [ADR 005 — E2EE và phục hồi](docs/adr/005-recoverable-e2ee-sessions.md).
4. [ADR 004](docs/adr/004-e2ee-without-double-ratchet.md) chỉ ghi lại thiết kế E2EE đã được thay thế.
