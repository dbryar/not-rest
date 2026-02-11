FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

FROM alpine:3.19

RUN apk add --no-cache wget

COPY --from=builder /server /server

EXPOSE 3000

CMD ["/server"]
