# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/issuer ./cmd/issuer

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/issuer /usr/local/bin/issuer
USER nonroot:nonroot
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/issuer"]
