# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS build
WORKDIR /src

# Copy module manifests first so `go mod download` is cached when only
# source code changes. The downloads themselves are not in the final
# image — only the compiled binary travels.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/publisher ./cmd/publisher

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/publisher /usr/local/bin/publisher
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/publisher"]
