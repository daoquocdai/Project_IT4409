# syntax=docker/dockerfile:1

ARG GO_VERSION=1.27.1
FROM golang:${GO_VERSION}-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

# Keep the migration tool inside the image so the host only needs Docker.
RUN CGO_ENABLED=0 go install github.com/pressly/goose/v3/cmd/goose@v3.24.3

COPY . .

RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mini-hermes-api ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mini-hermes-gateway ./cmd/ws-gateway
RUN GOOS=js GOARCH=wasm go build -trimpath -o /out/e2ee.wasm ./cmd/e2ee-wasm \
    && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
    && addgroup -S app \
    && adduser -S -G app app

WORKDIR /app

COPY --from=builder /out/mini-hermes-api /usr/local/bin/mini-hermes-api
COPY --from=builder /out/mini-hermes-gateway /usr/local/bin/mini-hermes-gateway
COPY --from=builder /go/bin/goose /usr/local/bin/goose
COPY --from=builder /src/web ./web
COPY --from=builder /out/e2ee.wasm ./web/e2ee.wasm
COPY --from=builder /out/wasm_exec.js ./web/wasm_exec.js
COPY --from=builder /src/db/migrations ./db/migrations
COPY --from=builder /src/config/config.yml.example ./config/config.yml

RUN mkdir -p /data/attachments && chown -R app:app /data/attachments

USER app

EXPOSE 8080 8081

CMD ["mini-hermes-api"]
