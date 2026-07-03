FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY go.work go.work.sum ./
COPY pkg/ pkg/
COPY services/catalogue/ services/catalogue/
COPY services/orders/    services/orders/
COPY services/carts/     services/carts/
COPY services/payments/  services/payments/
COPY services/shipping/  services/shipping/
COPY services/user/      services/user/

RUN go build -o /bin/user ./services/user

FROM gcr.io/distroless/static-debian12
COPY --from=builder /bin/user /user
EXPOSE 8080
ENTRYPOINT ["/user"]
