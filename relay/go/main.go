// goanon Yivi relay — small requestor backend for browser extensions.
// It starts Yivi/IRMA disclosure sessions and lets the extension poll results.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

const defaultAttribute = "pbdf.gemeente.personalData.dateofbirth"

var tokenRE = regexp.MustCompile(`^[A-Za-z0-9_-]{10,128}$`)

type config struct {
	Addr          string
	Upstream      string
	Authorization string
	AllowedOrigin string
	Attribute     string
	SessionTTL    time.Duration
}

type relay struct {
	cfg      config
	client   *http.Client
	sessions sync.Map // requestor token -> expiry time.Time
}

func main() {
	cfg := config{
		Addr:          ":" + getenv("PORT", "8787"),
		Upstream:      strings.TrimRight(getenv("YIVI_IRMA_SERVER", "http://127.0.0.1:8088"), "/"),
		Authorization: firstNonEmpty(os.Getenv("YIVI_REQUESTOR_AUTHORIZATION"), os.Getenv("YIVI_REQUESTOR_TOKEN")),
		AllowedOrigin: getenv("CORS_ORIGIN", "*"),
		Attribute:     getenv("YIVI_ATTRIBUTE", defaultAttribute),
		SessionTTL:    durationEnv("SESSION_TTL", 10*time.Minute),
	}
	if _, err := url.ParseRequestURI(cfg.Upstream); err != nil {
		log.Fatalf("invalid YIVI_IRMA_SERVER: %v", err)
	}
	r := &relay{cfg: cfg, client: &http.Client{Timeout: 20 * time.Second}}
	go r.cleanupLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", r.healthz)
	mux.HandleFunc("/session", r.session)
	mux.HandleFunc("/session/result/", r.result)

	log.Printf("goanon Yivi relay listening on %s → %s", cfg.Addr, cfg.Upstream)
	log.Fatal(http.ListenAndServe(cfg.Addr, r.cors(mux)))
}

func (r *relay) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		origin := req.Header.Get("Origin")
		if r.cfg.AllowedOrigin == "*" || origin == r.cfg.AllowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", firstNonEmpty(origin, "*"))
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, req)
	})
}

func (r *relay) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (r *relay) session(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := readSessionRequest(req.Body, r.cfg.Attribute)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	upReq, err := http.NewRequestWithContext(req.Context(), http.MethodPost, r.cfg.Upstream+"/session", bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create upstream request"})
		return
	}
	upReq.Header.Set("Content-Type", "application/json")
	if r.cfg.Authorization != "" {
		upReq.Header.Set("Authorization", r.cfg.Authorization)
	}

	resp, err := r.client.Do(upReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Yivi server unreachable"})
		return
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		proxyJSON(w, resp.StatusCode, payload)
		return
	}

	var pkg map[string]any
	if err := json.Unmarshal(payload, &pkg); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "invalid Yivi session package"})
		return
	}
	token, _ := pkg["token"].(string)
	if !tokenRE.MatchString(token) {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Yivi server returned invalid token"})
		return
	}
	r.sessions.Store(token, time.Now().Add(r.cfg.SessionTTL))
	writeRawJSON(w, http.StatusOK, payload)
}

func (r *relay) result(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimPrefix(req.URL.Path, "/session/result/")
	if !tokenRE.MatchString(token) || !r.known(token) {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "UNKNOWN", "error": "unknown or expired session"})
		return
	}

	ctx, cancel := context.WithTimeout(req.Context(), 20*time.Second)
	defer cancel()
	upReq, err := http.NewRequestWithContext(ctx, http.MethodGet, r.cfg.Upstream+"/session/"+url.PathEscape(token)+"/result", nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create upstream request"})
		return
	}
	if r.cfg.Authorization != "" {
		upReq.Header.Set("Authorization", r.cfg.Authorization)
	}
	resp, err := r.client.Do(upReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Yivi server unreachable"})
		return
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	proxyJSON(w, resp.StatusCode, payload)
}

func readSessionRequest(r io.Reader, attribute string) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return defaultDisclosure(attribute)
	}
	var req map[string]any
	if err := json.Unmarshal(body, &req); err != nil {
		return nil, errors.New("invalid JSON")
	}
	ctx, _ := req["@context"].(string)
	if ctx != "https://irma.app/ld/request/disclosure/v2" {
		return nil, errors.New("only Yivi disclosure/v2 requests are allowed")
	}
	if !onlyAttribute(req["disclose"], attribute) {
		return nil, fmt.Errorf("only disclosure of %s is allowed", attribute)
	}
	return body, nil
}

func onlyAttribute(v any, attribute string) bool {
	switch x := v.(type) {
	case string:
		return x == attribute
	case []any:
		if len(x) == 0 {
			return false
		}
		for _, item := range x {
			if !onlyAttribute(item, attribute) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func defaultDisclosure(attribute string) ([]byte, error) {
	return json.Marshal(map[string]any{
		"@context": "https://irma.app/ld/request/disclosure/v2",
		"disclose": []any{[]any{[]any{attribute}}},
	})
}

func (r *relay) known(token string) bool {
	v, ok := r.sessions.Load(token)
	if !ok {
		return false
	}
	if time.Now().After(v.(time.Time)) {
		r.sessions.Delete(token)
		return false
	}
	return true
}

func (r *relay) cleanupLoop() {
	for range time.Tick(time.Minute) {
		now := time.Now()
		r.sessions.Range(func(k, v any) bool {
			if now.After(v.(time.Time)) {
				r.sessions.Delete(k)
			}
			return true
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	b, _ := json.Marshal(v)
	writeRawJSON(w, status, b)
}

func writeRawJSON(w http.ResponseWriter, status int, b []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(b)
}

func proxyJSON(w http.ResponseWriter, status int, b []byte) {
	if len(bytes.TrimSpace(b)) == 0 {
		writeJSON(w, status, map[string]int{"status": status})
		return
	}
	writeRawJSON(w, status, b)
}

func getenv(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func durationEnv(k string, fallback time.Duration) time.Duration {
	v := os.Getenv(k)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
