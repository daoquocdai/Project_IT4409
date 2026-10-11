# Giải thích luồng Mini-Hermes

Theo dõi một tin nhắn từ lúc gửi đến khi hiển thị, rồi thêm mã hóa vào cùng luồng đó. Giả sử A, B và C đã đăng nhập; phần cuối giải thích cách đăng ký và đăng nhập chuẩn bị tài khoản, khóa và kết nối.

## Mục lục

1. [Khởi động hệ thống](#khởi-động-hệ-thống)
2. [Gửi và nhận một tin nhắn nhóm](#chat-nhóm-realtime)
3. [Chọn người nhận bằng cache thành viên](#cache-thành-viên)
4. [Gửi lại mà không tạo tin trùng](#retry-pending-và-dữ-liệu-client)
5. [Lấy bù tin khi mất kết nối](#lịch-sử-cache-và-reconnect)
6. [Đồng bộ trạng thái đọc giữa các tab](#read-marker-unread-và-nhiều-tab)
7. [Thêm E2EE vào chat 1-1](#e2ee-phiên-cố-định-và-khôi-phục)
8. [Đăng ký để tạo và bảo vệ khóa](#đăng-ký)
9. [Đăng nhập để mở lại khóa và bắt đầu chat](#đăng-nhập-và-vé-websocket)

## Khởi động hệ thống

API nhận yêu cầu và lưu tin. Gateway giữ kết nối WebSocket để đẩy tin đến các trình duyệt. Hai tiến trình dùng chung Redis Stream (hàng đợi sự kiện), còn PostgreSQL giữ lịch sử.

```mermaid
flowchart TD
    D["Chạy PostgreSQL và Redis"] --> C["Đọc cấu hình chung"]
    C --> A1
    C --> G1
    subgraph API["1. Khởi động API"]
        A1["Kết nối và kiểm tra PostgreSQL, Redis"] --> A2["Tạo các lớp xử lý yêu cầu"]
        A2 --> A3["Nhận HTTP tại :8080"]
    end
    subgraph GW["2. Khởi động gateway"]
        G1["Kết nối Redis, tạo bộ quản lý kết nối"] --> G2["Mở WebSocket tại :8081"]
        G1 --> G3["Đọc sự kiện từ Redis Stream"]
    end
```

Trong API, yêu cầu đi qua **handler → service → repository → PostgreSQL**: đọc request → kiểm tra nghiệp vụ → lưu dữ liệu. Request gửi kèm JWT, token xác nhận tài khoản đã đăng nhập. Gateway chạy việc đọc Redis và phục vụ WebSocket song song.

Hệ thống đã sẵn sàng. Bây giờ theo dõi A gửi một tin vào nhóm có A, B và C.

## Chat nhóm realtime

A gửi **“Chào nhóm”**. Client đặt mã riêng `m1` cho tin; server cấp số thứ tự `seq=7` trong cuộc trò chuyện. `m1` là ký hiệu rút gọn của UUID, còn `seq` dùng để sắp tin.

```mermaid
sequenceDiagram
    participant A as Trình duyệt A
    participant API as HTTP API
    participant DB as PostgreSQL
    participant RT as Redis và gateway
    participant N as Các tab của A, B, C
    A->>API: Gửi m1, nội dung Chào nhóm, kèm JWT
    API->>API: Kiểm tra đăng nhập, nội dung và quyền trong nhóm
    API->>DB: Khóa cuộc trò chuyện, cấp seq=7, lưu tin
    DB-->>API: Đã lưu thành công
    API->>RT: Thông báo message.created cho danh sách người nhận
    par Xác nhận cho người gửi
        API-->>A: Tin m1, seq=7 đã lưu
    and Phát realtime
        RT-->>N: WebSocket mang tin m1, seq=7
    end
    Note over A,N: HTTP và WebSocket có thể đến theo thứ tự khác nhau
```

Chỉ sau khi lưu thành công, API mới phát sự kiện. Gateway đưa sự kiện vào hàng đợi của từng kết nối rồi gửi qua WebSocket; Redis ACK xác nhận gateway đã xử lý, không xác nhận người dùng đã nhận hoặc đọc.

### Trình duyệt xử lý tin nhận được

A có thể nhận `m1` qua cả HTTP và WebSocket; B/C nhận qua WebSocket. Các nguồn đều được gộp vào cùng cache (bộ nhớ tạm) của cuộc trò chuyện.

```mermaid
flowchart TD
    I["Tin m1 từ HTTP, WebSocket hoặc lịch sử"] --> Q{"Đã có m1 trong cache?"}
    Q -->|Chưa| ADD["Thêm tin, sắp theo seq, hiển thị Chào nhóm"]
    Q -->|Có, cùng dữ liệu| KEEP["Giữ một bản, không hiển thị trùng"]
    Q -->|Có, khác dữ liệu| ERR["Báo xung đột, không ghi đè tin cũ"]
```

Nhóm dùng nội dung rõ. Tạo nhóm hoặc đổi thành viên cũng sinh một tin hệ thống, được lưu và phát theo luồng trên. Tiếp theo, cần giải thích API chọn danh sách người nhận như thế nào.

## Cache thành viên

Để phát `m1`, API cần biết **ai thuộc nhóm lúc tin số 7 được lưu**. Danh sách này được cache theo từng mốc thay đổi thành viên, giúp nhiều tin liên tiếp dùng lại cùng danh sách.

```mermaid
flowchart TD
    M["Tin đã lưu, seq=7"] --> V["PostgreSQL xác định mốc thành viên tại seq=7"]
    V --> Q{"Redis đã có danh sách ở mốc này?"}
    Q -->|Có, hợp lệ| HIT["Dùng danh sách đã cache"]
    Q -->|Chưa có hoặc cache lỗi| DB["Lấy danh sách tại seq=7 từ PostgreSQL"]
    DB --> SAVE["Lưu bản sao vào Redis, hết hạn sau 15 phút"]
    SAVE --> OUT["Phát m1 cho mọi kết nối của những người này"]
    HIT --> OUT
```

Cache chỉ giúp chọn nơi phát sự kiện; quyền gửi/đọc vẫn do PostgreSQL kiểm tra. Nếu C rời nhóm ở tin số 8, C vẫn nhận tin hệ thống số 8, nhưng bị loại khỏi người nhận từ tin số 9. Mỗi mốc có cache riêng nên không dùng danh sách hiện tại để phát lại một tin cũ.

Chọn đúng người nhận chưa đủ: mạng có thể mất response hoặc gửi lại cùng sự kiện. Mã `m1` giải quyết phần đó.

## Retry, pending và dữ liệu client

Nếu A chưa nhận được xác nhận, client giữ tin trong **pending** — bản gửi đang chờ kết quả. Gửi lại phải dùng đúng `m1` và nội dung ban đầu.

```mermaid
sequenceDiagram
    participant A as Trình duyệt A
    participant API as API và PostgreSQL
    A->>API: Gửi m1, Chào nhóm
    API->>API: Lưu m1 với seq=7
    Note over A,API: Phản hồi thất lạc, A chưa biết tin đã được lưu
    A->>API: Gửi lại đúng m1 và cùng nội dung
    API->>API: Tìm thấy tin cũ, giữ nguyên seq=7
    API-->>A: Trả lại m1 đã lưu
    A->>A: Bỏ pending và gộp tin vào cache
```

- Lỗi mạng/timeout/5xx có thể xảy ra sau commit: giữ bản gửi lại. UUID cũ với payload khác bị từ chối `409`.
- Tin nhóm bị từ chối `400/413`: bỏ pending, giữ draft để sửa và gửi tin mới. Tin nhóm được kiểm tra trước khi tạo UUID: sau trim có 1–1000 ký tự Unicode, không NUL.

Gửi lại giải quyết phía A. Còn nếu B offline và không nhận WebSocket, B cần lấy tin từ lịch sử.

## Lịch sử, cache và reconnect

PostgreSQL đã giữ `m1`, nên B có thể lấy bù khi kết nối lại. Cache phía trình duyệt giữ những tin đã tải; nó khác cache danh sách thành viên trong Redis ở phần trước.

```mermaid
sequenceDiagram
    participant B as Trình duyệt B
    participant G as Gateway
    participant API as HTTP API
    B->>G: Kết nối WebSocket lại bằng vé mới
    B->>API: GET /threads để đối chiếu trạng thái
    API-->>B: Cuộc trò chuyện đã có tin số 7
    alt Cache cần lấy bù tin
        B->>API: GET lịch sử, lấy thêm trang nếu cần
        API-->>B: Những tin được phép đọc, gồm m1
        B->>B: Gộp theo mã tin, sắp seq, hiển thị Chào nhóm
    else Cache đã đủ
        B->>B: Dùng dữ liệu đang có
    end
```

Tin thiếu cũng được lấy bù khi client phát hiện khoảng trống trong sequence. Lịch sử dùng cursor `before_seq`, trả trang từ mới đến cũ; client hiển thị từ cũ đến mới. B chỉ đọc các khoảng mình từng ở trong nhóm. Việc lấy bù theo sự kiện hoặc thao tác, không polling.

B đã thấy tin. Bước tiếp theo là cập nhật trạng thái đọc ở các tab khác của B.

## Read marker, unread và nhiều tab

Khi B đọc đến tin số 7, server lưu **read marker** — số thứ tự đã đánh dấu đọc. **Unread** là số tin của người khác còn sau marker trong lần tham gia nhóm hiện tại.

```mermaid
sequenceDiagram
    participant B as Tab B đang đọc
    participant API as API và PostgreSQL
    participant RT as Redis và gateway
    participant B2 as Tab khác của B
    B->>API: Đánh dấu đã đọc đến seq=7
    API->>API: Kiểm tra quyền, tăng marker, commit
    API->>RT: thread.updated gửi cho tài khoản B
    API-->>B: Marker đã lưu
    RT-->>B2: Thông báo cần tải lại trạng thái
    B2->>API: GET /threads sau khi gộp các thông báo gần nhau
    API-->>B2: Marker và unread mới
```

Marker chỉ tăng; client gửi khi tab đang hiển thị, ở cuối chat và tin đã được render sau sync. Publish thông báo đọc lỗi chỉ được log, marker đã commit vẫn thành công. `thread.updated` không phải tin chat và không tăng sequence.

Đến đây, nhóm đã có đủ luồng lưu, phát, gửi lại, lấy bù và đồng bộ đọc. Với chat 1-1, thêm bước bảo vệ nội dung ngay tại trình duyệt.

## E2EE: phiên cố định và khôi phục

E2EE là mã hóa đầu cuối: A mã hóa trước khi gửi, B giải mã sau khi nhận. Hai bên cần một **khóa phiên chung, gọi là SK**; mỗi tin dẫn xuất một khóa riêng từ SK. Server vẫn xử lý quyền, thứ tự và realtime, nhưng chỉ giữ bản mã và không có SK để giải mã nội dung.

### Tạo khóa phiên một lần cho A và B

Client dùng **X3DH**, cách thỏa thuận khóa từ bộ khóa riêng của mình và khóa công khai của người còn lại. B có thể offline khi A khởi tạo. Backend gọi bản ghi phiên này là **epoch**; SK được bảo vệ trong một **backup** (bản sao khóa đã mã hóa) để dùng lại trên thiết bị khác.

```mermaid
sequenceDiagram
    participant A as Trình duyệt A
    participant API as API và PostgreSQL
    A->>API: Mở chat riêng với B
    API-->>A: Cuộc trò chuyện của cặp A/B
    Note over A,API: Khi A cần gửi tin đầu tiên
    A->>API: Tải phiên khóa của cuộc trò chuyện
    alt Đã có phiên
        API-->>A: Phiên đã chọn, backup riêng nếu có
        A->>A: Khôi phục SK của phiên
    else Chưa có phiên
        A->>API: Lấy public bundle của B
        API-->>A: Khóa công khai để khởi tạo X3DH
        A->>A: Tạo SK, thông tin khởi tạo và backup SK mã hóa
        A->>API: Lưu đề xuất phiên và backup
        API->>API: Khóa thread, chọn phiên đầu tiên và commit cùng backup
        API-->>A: Phiên được server chọn
        A->>A: Kiểm tra và dùng SK của phiên đã được xác nhận
    end
```

Mỗi direct dùng một phiên cố định trên mọi tab và cả hai chiều. Nếu nhiều client khởi tạo đồng thời, server chọn một phiên; bên thua nhận `409` rồi khôi phục phiên đã chọn. B dùng bộ khóa riêng và thông tin khởi tạo để tính cùng SK. X3DH không chạy lại cho mỗi tin; không có rekey hay Double Ratchet.

### Gửi và nhận tin đã mã hóa

A gửi **“Chào B”** với mã `m2`. Bản mã gọi là **ciphertext**; gói gửi chứa bản mã và thông tin phiên gọi là **envelope**. Luồng này thêm mã hóa trước khi gửi và giải mã sau khi nhận vào đường gửi/nhận đã giải thích với nhóm.

```mermaid
sequenceDiagram
    participant A as Trình duyệt A
    participant S as API, Redis và gateway
    participant B as Trình duyệt B
    A->>A: SK, mã tin và hai bên tạo khóa riêng cho m2
    A->>A: Mã hóa Chào B thành bản mã
    A->>S: Gửi m2, bản mã và mã phiên
    S->>S: Kiểm tra quyền, người nhận, phiên và UUID, lưu rồi phát
    S-->>B: Bản mã m2 qua WebSocket
    B->>B: Lấy SK, dẫn xuất lại khóa tin
    B->>B: Giải mã và hiển thị Chào B
```

**Context** gắn khóa tin với cuộc trò chuyện, epoch, UUID và hai bên gửi/nhận. HKDF thực hiện dẫn xuất khóa; AES-256-GCM mã hóa và kiểm tra dữ liệu. **Envelope** chứa epoch, recipient, nonce và ciphertext. Retry giữ nguyên UUID và envelope.

WebSocket vẫn phát tới mọi kết nối của A và B, kể cả các tab của người gửi. Các tab gộp tin và lấy bù như nhóm; direct chỉ tăng marker sau khi giải mã thành công. Thông báo đọc của direct gửi cho cả reader và peer, nên A thấy B đã đọc.

### Đồng bộ khóa để đọc trên máy khác

B đăng nhập trên máy mới và tải được bản mã `m2`. Để đọc nó, máy mới còn phải khôi phục đúng SK của phiên. Vì vậy mỗi bên lưu **backup SK đã mã hóa riêng cho tài khoản của mình**.

```mermaid
sequenceDiagram
    participant B as Máy mới của B
    participant API as API và PostgreSQL
    B->>API: Tải phiên và backup riêng của B
    API-->>B: Thông tin khởi tạo, backup nếu đã có
    alt B đã có backup
        B->>B: Mở backup bằng khóa bảo vệ của tài khoản
    else B chưa từng lưu backup
        B->>B: Khôi phục bộ khóa riêng, tính SK và kiểm tra
        B->>API: Lưu backup SK mã hóa của B
        API-->>B: HTTP trả backup đã commit
        B->>B: Mở bản trả về và so với SK vừa tính
    end
    B->>API: Tải lịch sử bản mã
    API-->>B: m2 và các tin được phép đọc
    B->>B: Dùng SK để giải mã lịch sử gửi và nhận
```

Server chỉ trả backup của chính người gọi và giữ bản ghi đầu tiên. HTTP xác nhận lưu backup ở đây khác ACK của Redis ở luồng realtime. Khóa đã mở và SK nằm trong RAM của client.

Để máy mới mở được backup, tài khoản cần bộ khóa gốc và một cách mở lại chúng bằng mật khẩu. Đó là lý do đăng ký và đăng nhập có thêm vault.

## Đăng ký

**Vault** là bộ khóa riêng dùng cho X3DH của tài khoản, được mã hóa trước khi lưu server. Backup SK của từng cuộc trò chuyện được lưu riêng, bảo vệ bằng khóa dẫn xuất từ khóa mở vault.

```mermaid
flowchart TD
    P["Mật khẩu nhập tại browser"] --> D["Argon2id và HKDF dẫn xuất hai giá trị riêng"]
    D --> A["Credential dùng đăng nhập"]
    D --> V["Khóa mở vault, giữ phía client"]
    A --> H["Server lưu bcrypt hash của credential"]
    K["Client sinh bộ khóa X3DH"] --> C["Mã hóa vault chứa private keys"]
    V --> C
    K --> U["Public bundle và public prekeys"]
    C --> DB["Lưu hồ sơ: hash, public keys, vault mã hóa và tham số KDF"]
    U --> DB
    H --> DB
```

**Credential** là giá trị dẫn xuất để server kiểm tra đăng nhập, không phải mật khẩu gốc. Public keys phục vụ khởi tạo phiên; vault giữ các private keys để phục hồi, kể cả khi public prekey đã được claim. Server lưu thêm salt và tham số KDF để máy mới tạo lại đúng credential/khóa mở vault. Sau đăng ký thành công, web tự đăng nhập bằng credential vừa tạo.

Server đã có hồ sơ tài khoản và dữ liệu khóa mã hóa. Đăng nhập vừa xác thực user, vừa mở lại khóa ở client để thực hiện các bước chat phía trên.

## Đăng nhập và vé WebSocket

KDF là cách tạo khóa từ mật khẩu và **salt**, giá trị ngẫu nhiên của tài khoản được lưu từ lúc đăng ký. Máy mới dùng lại đúng salt và tham số đó.

```mermaid
sequenceDiagram
    participant B as Browser B hoặc máy mới
    participant API as HTTP API
    participant G as Gateway
    B->>API: Lấy tham số KDF của username
    API-->>B: Salt và tham số đã dùng lúc đăng ký
    B->>B: Mật khẩu tạo lại credential và khóa mở vault
    B->>API: Đăng nhập bằng credential
    API->>API: Kiểm tra bcrypt hash
    API-->>B: JWT xác thực tài khoản
    B->>API: Dùng JWT tải vault mã hóa
    API-->>B: Vault và bộ khóa công khai gốc
    B->>B: Mở vault, khôi phục bộ khóa riêng
    B->>API: Tải danh sách cuộc trò chuyện
    B->>API: Xin vé WebSocket một lần
    API-->>B: Vé và địa chỉ gateway
    B->>G: Kết nối WebSocket bằng vé
    G->>G: Tiêu thụ vé trong Redis trước khi mở kết nối
    G-->>B: Sẵn sàng nhận tin realtime
    Note over B: Khi đọc/gửi direct, tải backup và khôi phục SK nếu cần
```

JWT xác thực các request HTTP. Vé WebSocket dùng một lần, mặc định hết hạn sau 30 giây; browser xin vé mới mỗi lần kết nối lại. Các bước đã đủ để B tham gia luồng gửi/nhận và khôi phục lịch sử bằng cùng tài khoản trên nhiều thiết bị.

| Dữ liệu phía client | Nơi lưu |
| --- | --- |
| Private keys đã mở, SK, plaintext và cache tin | RAM của tab |
| JWT, username, user UUID, khóa mở vault để reload cùng phiên | `sessionStorage`, xóa khi đăng xuất |
| UUID/context/envelope/body của tin direct chưa xác nhận | Outbox trong `localStorage`, fallback RAM nếu storage lỗi |

Quên mật khẩu và mất mọi khóa đã mở thì không phục hồi được. Vault và backup phải còn trên server; giữ archive khóa để đọc lịch sử là đánh đổi được nêu trong [ADR 005](adr/005-recoverable-e2ee-sessions.md).

<details>
<summary>Đối chiếu code và giới hạn triển khai</summary>

| Luồng | Điểm đọc code |
| --- | --- |
| Khởi động API / gateway | [`run`](../cmd/main.go), [`run/serve`](../cmd/ws-gateway/main.go) |
| Handler → service → repository | [router](../internal/route/router.go), [`Send`](../internal/module/message/service/service.go), [transaction gửi tin](../internal/module/message/repository/postgres.go) |
| Publish, queue, ACK | [`PublishMessage`](../internal/module/message/service/publish.go), [`handleStreams`](../internal/gateway/consumer.go), [`Dispatch/writeLoop`](../internal/gateway/hub.go) |
| Nhóm và membership | [`CreateGroup/ChangeMember`](../internal/module/thread/repository/groups.go), [queries](../db/queries/groups.sql) |
| Cache thành viên | [`messageRecipients`](../internal/module/message/service/publish.go), [queries tại sequence](../db/queries/messages.sql), [`Redis.Get/Put`](../internal/module/thread/membership/redis.go) |
| Gộp tin, catch-up và read marker | [realtime core](../web/realtime-core.js), [`loadThreads/flushReadMarker`](../web/app.js), [`MarkRead`](../internal/module/thread/service/service.go) |
| Khóa phiên, tin mã hóa và backup | [client E2EE](../web/e2ee.js), [X3DH và backup](../internal/e2ee/epoch.go), [mã hóa tin](../internal/e2ee/messages.go) |
| Đăng ký, đăng nhập và vault | [`DeriveCredentials/EncryptAccountVault`](../internal/e2ee/account.go), [`Register/Login`](../internal/module/user/service/service.go), [lưu tài khoản](../internal/module/user/repository/postgres.go) |
| Dữ liệu client và danh sách user | [outbox](../web/e2ee-state.js), [`cacheSession/clearSession/loadUsers`](../web/app.js) |

- Cache thành viên dùng mốc lớn nhất không vượt seq: `joined_seq` hoặc `left_seq+1`. Redis GET/SET tối đa 100 ms trong tổng publish timeout; lỗi ghi cache chỉ log.
- Publish message lỗi sau commit trả `503`; retry giữ UUID/body. Chưa có transactional outbox backend. Gateway hiện hỗ trợ một instance; queue đầy/kết nối chậm bị đóng để client lấy bù REST. Xem [ADR 001](adr/001-gateway-and-stream.md), [ADR 003](adr/003-message-order.md).
- Nhóm tối đa 100 người, creator là admin. Thêm/xóa/rời sinh tin hệ thống; admin cuối rời thì chuyển cho người còn lại tham gia sớm nhất. Tạo nhóm chưa có idempotency key; lỗi sau commit phải đối chiếu trước khi tạo lại.
- Marker chỉ tăng trong phạm vi membership, unread do server đếm; không bằng hiệu hai sequence. Xem [ADR 002](adr/002-unread-count.md).
- KDF v1: Argon2id, salt 16 byte, 65536 KiB, 3 lượt, parallelism 4, output 32 byte. IK/SPK/OPK là khóa định danh/prekey có chữ ký/prekey dùng một lần. Mỗi tài khoản tạo 20 OPK; direct mới hết public OPK dùng X3DH 3 DH thay vì 4 DH. AES-GCM dùng nonce 12 byte, tag 16 byte.
- UI chưa có đối chiếu fingerprint hoặc đổi mật khẩu. Nút làm mới user chỉ gọi `GET /users` theo thao tác, giữ lựa chọn còn hợp lệ và trạng thái chat. Schema/quyền membership chi tiết: [ERD](chat-api-erd.md). Cách chạy/kiểm tra: [README](../README.md).

</details>
