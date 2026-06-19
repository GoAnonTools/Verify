# Build: docker build -t goanon-yivi-relay -f relay/go/Dockerfile .
FROM golang:1.23-alpine AS build
WORKDIR /src/relay/go
COPY relay/go/go.mod ./
COPY relay/go/main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/yivi-relay .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/yivi-relay /yivi-relay
EXPOSE 8787
USER nonroot:nonroot
ENTRYPOINT ["/yivi-relay"]
