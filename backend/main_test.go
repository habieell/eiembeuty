package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func TestNormalizePhone(t *testing.T) {
	for _, s := range []string{"081234567890", "+62 812-3456-7890", "6281234567890"} {
		if got := normalizePhone(s); got != "081234567890" {
			t.Errorf("%s -> %s", s, got)
		}
	}
	for _, s := range []string{"123", "abcdefghijk", "081234567890000000000"} {
		if phoneRE.MatchString(normalizePhone(s)) {
			t.Errorf("accepted %s", s)
		}
	}
}

type browser struct {
	router http.Handler
	cookie *http.Cookie
}

func (b *browser) request(method, path string, body any, key string) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	if b.cookie != nil {
		r.AddCookie(b.cookie)
	}
	w := httptest.NewRecorder()
	b.router.ServeHTTP(w, r)
	return w
}
func expect(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("wanted %d got %d: %s", status, w.Code, w.Body.String())
	}
}
func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v
}
func TestAPIIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set TEST_DATABASE_URL to run integration tests against real PostgreSQL")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("test_eiem_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.Exec(ctx, "DROP SCHEMA "+quoted+" CASCADE") }()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err = migrate(ctx, db); err != nil {
		t.Fatal("migration must be repeatable", err)
	}
	gin.SetMode(gin.TestMode)
	app := newApp(db, false, "http://localhost:3000,http://127.0.0.1:3000")
	router := app.router()
	b := &browser{router: router}
	input := map[string]any{"phone_number": "+6281234567890", "user_name": "Mitra Test", "password": "TestPassword123!", "kode_distributor": "STD", "kode_outlet": "BAL-STD-00240"}
	login := func(client *browser, phone string) {
		t.Helper()
		w := client.request("POST", "/api/auth/login", map[string]string{"phone_number": phone, "password": "TestPassword123!"}, "")
		expect(t, w, 200)
		cookies := w.Result().Cookies()
		if len(cookies) == 0 {
			t.Fatal("missing cookie")
		}
		client.cookie = cookies[0]
		if !client.cookie.HttpOnly || client.cookie.SameSite != http.SameSiteStrictMode {
			t.Fatal("session cookie flags")
		}
	}
	t.Run("authorization_and_dependent_outlets", func(t *testing.T) {
		expect(t, b.request("GET", "/api/products", nil, ""), 401)
		expect(t, b.request("GET", "/api/outlets", nil, ""), 400)
		w := b.request("GET", "/api/outlets?distributor=STD", nil, "")
		expect(t, w, 200)
		if len(decode[[]map[string]string](t, w)) != 2 {
			t.Fatal("STD outlets")
		}
		w = b.request("GET", "/api/outlets?distributor=JKT", nil, "")
		expect(t, w, 200)
		if len(decode[[]map[string]string](t, w)) != 1 {
			t.Fatal("JKT outlets")
		}
	})
	t.Run("registration_validation_and_bcrypt", func(t *testing.T) {
		input["kode_distributor"] = "JKT"
		expect(t, b.request("POST", "/api/auth/register", input, ""), 400)
		input["kode_distributor"] = "STD"
		input["password"] = "tiny"
		expect(t, b.request("POST", "/api/auth/register", input, ""), 400)
		input["password"] = "TestPassword123!"
		expect(t, b.request("POST", "/api/auth/register", input, ""), 201)
		expect(t, b.request("POST", "/api/auth/register", input, ""), 409)
		var hash string
		if err := db.QueryRow(ctx, `SELECT user_password FROM ms_user WHERE phone_number='081234567890'`).Scan(&hash); err != nil {
			t.Fatal(err)
		}
		if hash == input["password"] || bcrypt.CompareHashAndPassword([]byte(hash), []byte("TestPassword123!")) != nil {
			t.Fatal("invalid bcrypt hash")
		}
	})
	t.Run("login_cookie_and_origin", func(t *testing.T) {
		expect(t, b.request("POST", "/api/auth/login", map[string]string{"phone_number": "081234567890", "password": "wrong"}, ""), 401)
		login(b, "+6281234567890")
		expect(t, b.request("GET", "/api/auth/me", nil, ""), 200)
		r := httptest.NewRequest("POST", "/api/auth/logout", strings.NewReader("{}"))
		r.Header.Set("Origin", "https://evil.example")
		r.Header.Set("Content-Type", "application/json")
		r.AddCookie(b.cookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		expect(t, w, 403)
	})
	body := OrderInput{Items: []ItemInput{{"EI-A01", 5}, {"EI-A03", 3}}, ExpectedTotal: 300000}
	var number string
	counts := func() (int, int) {
		var h, d int
		_ = db.QueryRow(ctx, "SELECT count(*) FROM tr_order_header").Scan(&h)
		_ = db.QueryRow(ctx, "SELECT count(*) FROM tr_order_detail").Scan(&d)
		return h, d
	}
	t.Run("invalid_cart_and_authoritative_prices", func(t *testing.T) {
		expect(t, b.request("POST", "/api/orders", OrderInput{Items: []ItemInput{{"MISSING", 1}}, ExpectedTotal: 1}, "invalid-product-key1"), 400)
		expect(t, b.request("POST", "/api/orders", OrderInput{Items: []ItemInput{{"EI-A01", 0}}, ExpectedTotal: 1}, "invalid-quantity-key"), 400)
		expect(t, b.request("POST", "/api/orders", OrderInput{Items: []ItemInput{{"EI-A01", 1}, {"EI-A01", 1}}, ExpectedTotal: 60000}, "duplicate-product-key"), 400)
		expect(t, b.request("POST", "/api/orders", map[string]any{"items": []map[string]any{{"kode_sku": "EI-A01", "quantity": 1, "unit_price": 1}}, "expected_total": 1}, "tampered-price-key1"), 400)
		h, d := counts()
		if h != 0 || d != 0 {
			t.Fatal("invalid requests persisted")
		}
		copy := body
		copy.ExpectedTotal = 1
		expect(t, b.request("POST", "/api/orders", copy, "wrong-expected-total"), 409)
		expect(t, b.request("POST", "/api/orders", body, ""), 400)
	})
	t.Run("preview_and_transactional_checkout", func(t *testing.T) {
		w := b.request("POST", "/api/checkout/preview", body, "")
		expect(t, w, 200)
		q := decode[Order](t, w)
		if q.Total != 300000 || q.Quantity != 8 || len(q.Items) != 2 {
			t.Fatalf("wrong preview %+v", q)
		}
		w = b.request("POST", "/api/orders", body, "valid-order-request1")
		expect(t, w, 201)
		number = decode[map[string]string](t, w)["order_number"]
		if !strings.HasPrefix(number, "CAS-") {
			t.Fatal(number)
		}
		h, d := counts()
		if h != 1 || d != 2 {
			t.Fatal(h, d)
		}
		w = b.request("POST", "/api/orders", body, "valid-order-request1")
		expect(t, w, 200)
		if decode[map[string]any](t, w)["order_number"] != number {
			t.Fatal("retry created different order")
		}
	})
	t.Run("history_details_and_price_snapshot", func(t *testing.T) {
		_, err := db.Exec(ctx, "UPDATE ms_product SET harga_jual=31000 WHERE kode_sku='EI-A01'")
		if err != nil {
			t.Fatal(err)
		}
		w := b.request("GET", "/api/orders/"+number, nil, "")
		expect(t, w, 200)
		o := decode[Order](t, w)
		if o.Total != 300000 || len(o.Items) != 2 || o.Items[0].Price != 30000 || o.Outlet != "BAL-STD-00240" {
			t.Fatalf("wrong saved snapshot %+v", o)
		}
		expect(t, b.request("GET", "/api/orders", nil, ""), 200)
		_, _ = db.Exec(ctx, "UPDATE ms_product SET harga_jual=30000 WHERE kode_sku='EI-A01'")
	})
	t.Run("user_order_isolation", func(t *testing.T) {
		input["phone_number"] = "081234567891"
		other := &browser{router: router}
		expect(t, other.request("POST", "/api/auth/register", input, ""), 201)
		login(other, "081234567891")
		expect(t, other.request("GET", "/api/orders/"+number, nil, ""), 404)
		w := other.request("GET", "/api/orders", nil, "")
		expect(t, w, 200)
		if len(decode[[]Order](t, w)) != 0 {
			t.Fatal("leaked another user's history")
		}
	})
	t.Run("concurrent_checkout_retry", func(t *testing.T) {
		var wg sync.WaitGroup
		out := make(chan *httptest.ResponseRecorder, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); out <- b.request("POST", "/api/orders", body, "concurrent-order-key1") }()
		}
		wg.Wait()
		close(out)
		created := 0
		for w := range out {
			if w.Code == 201 {
				created++
			} else if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
		}
		h, d := counts()
		if created != 1 || h != 2 || d != 4 {
			t.Fatalf("concurrency failure %d %d %d", created, h, d)
		}
	})
	t.Run("database_failure_rolls_back_all_lines", func(t *testing.T) {
		_, err := db.Exec(ctx, `CREATE FUNCTION reject_test_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kode_sku='EI-A03' THEN RAISE EXCEPTION 'test failure after first detail'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_line BEFORE INSERT ON tr_order_detail FOR EACH ROW EXECUTE FUNCTION reject_test_line();`)
		if err != nil {
			t.Fatal(err)
		}
		h, d := counts()
		expect(t, b.request("POST", "/api/orders", body, "rollback-request-key1"), 500)
		h2, d2 := counts()
		if h != h2 || d != d2 {
			t.Fatal("partial order committed")
		}
		_, _ = db.Exec(ctx, "DROP TRIGGER reject_line ON tr_order_detail; DROP FUNCTION reject_test_line()")
		expect(t, b.request("POST", "/api/orders", body, "rollback-request-key1"), 201)
	})
	t.Run("logout_and_expired_sessions", func(t *testing.T) {
		old := b.cookie
		expect(t, b.request("POST", "/api/auth/logout", map[string]any{}, ""), 200)
		b.cookie = old
		expect(t, b.request("GET", "/api/auth/me", nil, ""), 401)
		login(b, "081234567890")
		_, _ = db.Exec(ctx, "UPDATE user_sessions SET expires_at=now()-interval '1 minute'")
		expect(t, b.request("GET", "/api/auth/me", nil, ""), 401)
	})
	t.Run("login_rate_limit", func(t *testing.T) {
		var code int
		for i := 0; i < 20; i++ {
			code = b.request("POST", "/api/auth/login", map[string]string{"phone_number": "081234567890", "password": "wrong"}, "").Code
			if code == 429 {
				break
			}
		}
		if code != 429 {
			t.Fatal("missing rate limit")
		}
	})
}
