# ═══════════════════════════════════════════════════════════════
# File:     Dockerfile
# Purpose:  Multi-stage Docker build for the TryBlynx Go server
# Role:     Produces a minimal (~15MB) scratch-based container
#           with only the statically-linked Go binary. No shell,
#           no OS, no attack surface.
#
# Build stages:
#   1. builder: Compiles the Go binary with CGO_ENABLED=0 for
#      full static linking. Uses Go 1.23 official image.
#   2. final: Copies the binary into a scratch image with CA
#      certificates for HTTPS (Stripe API) and a non-root user.
#
# Usage:
#   docker build -t tryblynx .
#   docker run --env-file .env -p 8080:8080 tryblynx
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

# Install git (needed for go mod download with private repos)
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy dependency manifests first for Docker layer caching
COPY go.mod go.sum ./
RUN go mod download

# Bypass proxy.golang.org to avoid IPv6 "network is unreachable" issues
ENV GOPROXY=direct

# Copy source code
COPY . .

# Generate missing dependency checksums
RUN go mod tidy

# Build the server binary
# CGO_ENABLED=0: Static binary, no C dependencies
# -ldflags="-s -w": Strip debug info and symbol table (smaller binary)
# -trimpath: Remove filesystem paths from binary (security)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -trimpath \
    -o /build/tryblynx ./cmd/server

# ── Stage 2: Final Image ─────────────────────────────────────
FROM scratch

# Import CA certificates for HTTPS (required for Stripe API calls)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary
COPY --from=builder /build/tryblynx /tryblynx

# Copy migration files (for volume mounting or init containers)
COPY --from=builder /build/db /db

# Expose the server port (default 8080, configurable via SERVER_PORT)
EXPOSE 8080

# Run as non-root (UID 65534 = nobody)
USER 65534

# Start the server
ENTRYPOINT ["/tryblynx"]