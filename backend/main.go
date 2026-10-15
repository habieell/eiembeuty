package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

//go:embed db/*.sql
var migrations embed.FS

type App struct {
	db      *pgxpool.Pool
	secure  bool
	origins map[string]bool
	limiter *rateLimiter
	dummy   []byte
}
type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}
type User struct {
	Phone           string `json:"phone_number"`
	Name            string `json:"user_name"`
	Outlet          string `json:"kode_outlet"`
	Distributor     string `json:"kode_distributor"`
	OutletName      string `json:"outlet_name"`
	DistributorName string `json:"distributor_name"`
}
type Product struct {
	SKU   string `json:"kode_sku"`
	Name  string `json:"nama_sku"`
	Image string `json:"image_url"`
	Price int64  `json:"harga_jual"`
}
type ItemInput struct {
	SKU string `json:"kode_sku" binding:"required,max=30"`
	Qty int    `json:"quantity" binding:"required,min=1,max=999"`
}
type OrderInput struct {
	Items         []ItemInput `json:"items" binding:"required,min=1,max=50,dive"`
	ExpectedTotal int64       `json:"expected_total"`
}
type OrderItem struct {
	Product
	Quantity int   `json:"quantity"`
	Total    int64 `json:"total_price"`
}
type Order struct {
	Number          string      `json:"order_number"`
	Date            time.Time   `json:"order_date"`
	Status          string      `json:"order_status"`
	Outlet          string      `json:"kode_outlet"`
	Distributor     string      `json:"kode_distributor"`
	OutletName      string      `json:"outlet_name"`
	DistributorName string      `json:"distributor_name"`
	Quantity        int         `json:"total_quantity"`
	Total           int64       `json:"total_price"`
	Items           []OrderItem `json:"items,omitempty"`
}

var phoneRE = regexp.MustCompile(`^08[0-9]{8,11}$`)
var keyRE = regexp.MustCompile(`^[a-zA-Z0-9-]{16,64}$`)

func normalizePhone(v string) string {
	v = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(v))
	if strings.HasPrefix(v, "+62") {
		v = "0" + v[3:]
	} else if strings.HasPrefix(v, "62") {
		v = "0" + v[2:]
	}
	return v
}
func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func tokenHash(v string) string { h := sha256.Sum256([]byte(v)); return hex.EncodeToString(h[:]) }
func fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}
func internal(c *gin.Context, err error) {
	log.Printf("request %s: %v", c.FullPath(), err)
	fail(c, 500, "Terjadi kesalahan server. Silakan coba lagi.")
}
func uniqueViolation(err error) bool {
	var p *pgconn.PgError
	return errors.As(err, &p) && p.Code == "23505"
}
func (l *rateLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, values := range l.attempts {
		if len(values) == 0 || now.Sub(values[len(values)-1]) > time.Minute {
			delete(l.attempts, k)
		}
	}
	fresh := []time.Time{}
	for _, t := range l.attempts[ip] {
		if now.Sub(t) < time.Minute {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= 15 {
		return false
	}
	l.attempts[ip] = append(fresh, now)
	return true
}
func newApp(db *pgxpool.Pool, secure bool, origins string) *App {
	dummy, _ := bcrypt.GenerateFromPassword([]byte(randomToken()), bcrypt.DefaultCost)
	a := &App{db: db, secure: secure, origins: map[string]bool{}, limiter: &rateLimiter{attempts: map[string][]time.Time{}}, dummy: dummy}
	for _, v := range strings.Split(origins, ",") {
		a.origins[strings.TrimSpace(v)] = true
	}
	return a
}
func (a *App) router() *gin.Engine {
	gin.EnableJsonDecoderDisallowUnknownFields()
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	_ = r.SetTrustedProxies(nil)
	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "no-store")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
		if c.Request.Method != "GET" && c.Request.Method != "HEAD" {
			if origin := c.GetHeader("Origin"); origin != "" && !a.origins[origin] {
				fail(c, 403, "Origin tidak diizinkan.")
				return
			}
			if !strings.HasPrefix(c.GetHeader("Content-Type"), "application/json") {
				fail(c, 415, "Gunakan Content-Type application/json.")
				return
			}
		}
		c.Next()
	})
	r.GET("/api/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := a.db.Ping(ctx); err != nil {
			fail(c, 503, "Database belum siap.")
			return
		}
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/api/distributors", a.distributors)
	r.GET("/api/outlets", a.outlets)
	r.POST("/api/auth/register", a.register)
	r.POST("/api/auth/login", a.login)
	p := r.Group("/api")
	p.Use(a.auth)
	p.GET("/auth/me", func(c *gin.Context) { c.JSON(200, c.MustGet("user")) })
	p.POST("/auth/logout", a.logout)
	p.GET("/products", a.products)
	p.POST("/checkout/preview", a.preview)
	p.POST("/orders", a.createOrder)
	p.GET("/orders", a.orders)
	p.GET("/orders/:number", a.order)
	return r
}

const userQuery = `SELECT u.phone_number,u.user_name,u.kode_outlet,u.kode_distributor,o.nama_outlet,d.nama_distributor FROM ms_user u JOIN ms_outlet o USING(kode_outlet) JOIN ms_distributor d ON d.kode_distributor=u.kode_distributor`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.Phone, &u.Name, &u.Outlet, &u.Distributor, &u.OutletName, &u.DistributorName)
	return u, err
}
func (a *App) auth(c *gin.Context) {
	t, err := c.Cookie("eiem_session")
	if err != nil || len(t) != 64 {
		fail(c, 401, "Silakan masuk terlebih dahulu.")
		return
	}
	u, err := scanUser(a.db.QueryRow(c.Request.Context(), userQuery+` JOIN user_sessions s ON s.phone_number=u.phone_number WHERE s.token_hash=$1 AND s.expires_at>now()`, tokenHash(t)))
	if errors.Is(err, pgx.ErrNoRows) {
		fail(c, 401, "Sesi berakhir. Silakan masuk kembali.")
		return
	}
	if err != nil {
		internal(c, err)
		return
	}
	c.Set("user", u)
	c.Next()
}
func (a *App) cookie(c *gin.Context, v string, age int) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("eiem_session", v, age, "/", "", a.secure, true)
}
func (a *App) distributors(c *gin.Context) {
	rows, err := a.db.Query(c.Request.Context(), `SELECT kode_distributor,nama_distributor FROM ms_distributor ORDER BY kode_distributor`)
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var code, name string
		if err = rows.Scan(&code, &name); err != nil {
			internal(c, err)
			return
		}
		out = append(out, gin.H{"kode_distributor": code, "nama_distributor": name})
	}
	if rows.Err() != nil {
		internal(c, rows.Err())
		return
	}
	c.JSON(200, out)
}
func (a *App) outlets(c *gin.Context) {
	code := c.Query("distributor")
	if code == "" || len(code) > 30 {
		fail(c, 400, "Pilih distributor terlebih dahulu.")
		return
	}
	rows, err := a.db.Query(c.Request.Context(), `SELECT kode_outlet,nama_outlet FROM ms_outlet WHERE kode_distributor=$1 ORDER BY kode_outlet`, code)
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var code, name string
		if err = rows.Scan(&code, &name); err != nil {
			internal(c, err)
			return
		}
		out = append(out, gin.H{"kode_outlet": code, "nama_outlet": name})
	}
	if rows.Err() != nil {
		internal(c, rows.Err())
		return
	}
	c.JSON(200, out)
}
func (a *App) register(c *gin.Context) {
	if !a.limiter.allow(c.ClientIP()) {
		fail(c, 429, "Terlalu banyak percobaan. Coba satu menit lagi.")
		return
	}
	var in struct {
		Phone       string `json:"phone_number" binding:"required,max=30"`
		Name        string `json:"user_name" binding:"required,max=100"`
		Password    string `json:"password" binding:"required"`
		Outlet      string `json:"kode_outlet" binding:"required,max=40"`
		Distributor string `json:"kode_distributor" binding:"required,max=30"`
	}
	if c.ShouldBindJSON(&in) != nil {
		fail(c, 400, "Lengkapi data registrasi dengan benar.")
		return
	}
	in.Phone = normalizePhone(in.Phone)
	in.Name = strings.TrimSpace(in.Name)
	if !phoneRE.MatchString(in.Phone) || len(in.Name) < 2 || len(in.Password) < 8 || len(in.Password) > 72 {
		fail(c, 400, "Nomor handphone tidak valid, nama minimal 2 karakter, password 8–72 byte.")
		return
	}
	var valid bool
	err := a.db.QueryRow(c.Request.Context(), `SELECT EXISTS(SELECT 1 FROM ms_outlet WHERE kode_outlet=$1 AND kode_distributor=$2)`, in.Outlet, in.Distributor).Scan(&valid)
	if err != nil {
		internal(c, err)
		return
	}
	if !valid {
		fail(c, 400, "Outlet tidak sesuai distributor.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		internal(c, err)
		return
	}
	_, err = a.db.Exec(c.Request.Context(), `INSERT INTO ms_user VALUES($1,$2,$3,$4,$5)`, in.Phone, in.Name, string(hash), in.Outlet, in.Distributor)
	if uniqueViolation(err) {
		fail(c, 409, "Nomor handphone sudah terdaftar.")
		return
	}
	if err != nil {
		internal(c, err)
		return
	}
	c.JSON(201, gin.H{"message": "Registrasi berhasil. Silakan masuk."})
}
func (a *App) login(c *gin.Context) {
	if !a.limiter.allow(c.ClientIP()) {
		fail(c, 429, "Terlalu banyak percobaan. Coba satu menit lagi.")
		return
	}
	var in struct {
		Phone    string `json:"phone_number" binding:"required,max=30"`
		Password string `json:"password" binding:"required"`
	}
	if c.ShouldBindJSON(&in) != nil || len(in.Password) > 72 {
		fail(c, 400, "Isi nomor handphone dan password.")
		return
	}
	in.Phone = normalizePhone(in.Phone)
	var hash string
	err := a.db.QueryRow(c.Request.Context(), `SELECT user_password FROM ms_user WHERE phone_number=$1`, in.Phone).Scan(&hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		internal(c, err)
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		hash = string(a.dummy)
	}
	valid := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) == nil
	if !valid || err != nil {
		fail(c, 401, "Nomor handphone atau password salah.")
		return
	}
	token := randomToken()
	_, err = a.db.Exec(c.Request.Context(), `INSERT INTO user_sessions VALUES($1,$2,$3)`, tokenHash(token), in.Phone, time.Now().Add(24*time.Hour))
	if err != nil {
		internal(c, err)
		return
	}
	// Retire an earlier session cookie when logging in again.
	if old, e := c.Cookie("eiem_session"); e == nil {
		_, _ = a.db.Exec(c.Request.Context(), `DELETE FROM user_sessions WHERE token_hash=$1`, tokenHash(old))
	}
	_, _ = a.db.Exec(c.Request.Context(), `DELETE FROM user_sessions WHERE expires_at<now()`)
	a.cookie(c, token, 86400)
	u, err := scanUser(a.db.QueryRow(c.Request.Context(), userQuery+` WHERE u.phone_number=$1`, in.Phone))
	if err != nil {
		internal(c, err)
		return
	}
	c.JSON(200, u)
}
func (a *App) logout(c *gin.Context) {
	t, _ := c.Cookie("eiem_session")
	if _, err := a.db.Exec(c.Request.Context(), `DELETE FROM user_sessions WHERE token_hash=$1`, tokenHash(t)); err != nil {
		internal(c, err)
		return
	}
	a.cookie(c, "", -1)
	c.JSON(200, gin.H{"message": "Berhasil keluar."})
}
func (a *App) products(c *gin.Context) {
	rows, err := a.db.Query(c.Request.Context(), `SELECT kode_sku,nama_sku,image_url,harga_jual::bigint FROM ms_product ORDER BY kode_sku`)
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		var p Product
		if err = rows.Scan(&p.SKU, &p.Name, &p.Image, &p.Price); err != nil {
			internal(c, err)
			return
		}
		out = append(out, p)
	}
	if rows.Err() != nil {
		internal(c, rows.Err())
		return
	}
	c.JSON(200, out)
}

var errCart = errors.New("Produk tidak tersedia atau jumlah produk tidak valid.")

func quote(ctx context.Context, tx pgx.Tx, inputs []ItemInput) ([]OrderItem, int64, int, error) {
	if len(inputs) < 1 || len(inputs) > 50 {
		return nil, 0, 0, errCart
	}
	items := []OrderItem{}
	seen := map[string]bool{}
	var total int64
	qty := 0
	// Stable lock order also avoids deadlocks when catalog prices are maintained.
	ordered := append([]ItemInput(nil), inputs...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].SKU < ordered[j].SKU })
	for _, input := range ordered {
		if input.Qty < 1 || input.Qty > 999 || seen[input.SKU] {
			return nil, 0, 0, errCart
		}
		seen[input.SKU] = true
		var p Product
		err := tx.QueryRow(ctx, `SELECT kode_sku,nama_sku,image_url,harga_jual::bigint FROM ms_product WHERE kode_sku=$1 FOR SHARE`, input.SKU).Scan(&p.SKU, &p.Name, &p.Image, &p.Price)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, 0, errCart
		}
		if err != nil {
			return nil, 0, 0, err
		}
		line := p.Price * int64(input.Qty)
		total += line
		qty += input.Qty
		items = append(items, OrderItem{p, input.Qty, line})
	}
	return items, total, qty, nil
}
func (a *App) preview(c *gin.Context) {
	var in OrderInput
	if c.ShouldBindJSON(&in) != nil {
		fail(c, 400, "Keranjang tidak valid.")
		return
	}
	ctx := c.Request.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		internal(c, err)
		return
	}
	defer tx.Rollback(ctx)
	items, total, qty, err := quote(ctx, tx, in.Items)
	if errors.Is(err, errCart) {
		fail(c, 400, err.Error())
		return
	}
	if err != nil {
		internal(c, err)
		return
	}
	c.JSON(200, gin.H{"items": items, "total_price": total, "total_quantity": qty})
}
func (a *App) createOrder(c *gin.Context) {
	key := c.GetHeader("Idempotency-Key")
	if !keyRE.MatchString(key) {
		fail(c, 400, "Idempotency-Key wajib diisi (16–64 karakter).")
		return
	}
	var in OrderInput
	if c.ShouldBindJSON(&in) != nil || in.ExpectedTotal <= 0 {
		fail(c, 400, "Keranjang dan total konfirmasi wajib valid.")
		return
	}
	u := c.MustGet("user").(User)
	ctx := c.Request.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		internal(c, err)
		return
	}
	defer tx.Rollback(ctx)
	// Serialize checkout per account so retries with the same key create one order.
	var phone string
	if err = tx.QueryRow(ctx, `SELECT phone_number FROM ms_user WHERE phone_number=$1 FOR UPDATE`, u.Phone).Scan(&phone); err != nil {
		internal(c, err)
		return
	}
	var existing string
	err = tx.QueryRow(ctx, `SELECT order_number FROM tr_order_header WHERE phone_number=$1 AND idempotency_key=$2`, u.Phone, key).Scan(&existing)
	if err == nil {
		c.JSON(200, gin.H{"order_number": existing, "replayed": true})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		internal(c, err)
		return
	}
	items, total, _, err := quote(ctx, tx, in.Items)
	if errors.Is(err, errCart) {
		fail(c, 400, err.Error())
		return
	}
	if err != nil {
		internal(c, err)
		return
	}
	if in.ExpectedTotal != total {
		fail(c, 409, "Harga berubah. Muat ulang ringkasan pesanan.")
		return
	}
	loc := time.FixedZone("WIB", 7*3600)
	number := "CAS-" + time.Now().In(loc).Format("20060102") + "-" + randomToken()[:16]
	_, err = tx.Exec(ctx, `INSERT INTO tr_order_header(order_number,phone_number,kode_outlet,kode_distributor,outlet_name,distributor_name,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)`, number, u.Phone, u.Outlet, u.Distributor, u.OutletName, u.DistributorName, key)
	if err != nil {
		internal(c, err)
		return
	}
	for i, item := range items {
		_, err = tx.Exec(ctx, `INSERT INTO tr_order_detail VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, number, i+1, item.SKU, item.Name, item.Image, item.Quantity, item.Price, item.Total)
		if err != nil {
			internal(c, err)
			return
		}
	}
	if err = tx.Commit(ctx); err != nil {
		internal(c, err)
		return
	}
	c.JSON(201, gin.H{"order_number": number})
}

const orderQuery = `SELECT h.order_number,h.order_date,h.order_status,h.kode_outlet,h.kode_distributor,h.outlet_name,h.distributor_name,COALESCE(sum(d.qty_ordered),0)::int,COALESCE(sum(d.total_price),0)::bigint FROM tr_order_header h LEFT JOIN tr_order_detail d USING(order_number)`

func scanOrder(row interface{ Scan(...any) error }) (Order, error) {
	var o Order
	err := row.Scan(&o.Number, &o.Date, &o.Status, &o.Outlet, &o.Distributor, &o.OutletName, &o.DistributorName, &o.Quantity, &o.Total)
	return o, err
}
func (a *App) orders(c *gin.Context) {
	u := c.MustGet("user").(User)
	rows, err := a.db.Query(c.Request.Context(), orderQuery+` WHERE h.phone_number=$1 GROUP BY h.order_number ORDER BY h.order_date DESC,h.order_number DESC`, u.Phone)
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	out := []Order{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			internal(c, err)
			return
		}
		out = append(out, o)
	}
	if rows.Err() != nil {
		internal(c, rows.Err())
		return
	}
	c.JSON(200, out)
}
func (a *App) order(c *gin.Context) {
	u := c.MustGet("user").(User)
	ctx := c.Request.Context()
	o, err := scanOrder(a.db.QueryRow(ctx, orderQuery+` WHERE h.phone_number=$1 AND h.order_number=$2 GROUP BY h.order_number`, u.Phone, c.Param("number")))
	if errors.Is(err, pgx.ErrNoRows) {
		fail(c, 404, "Pesanan tidak ditemukan.")
		return
	}
	if err != nil {
		internal(c, err)
		return
	}
	rows, err := a.db.Query(ctx, `SELECT kode_sku,product_name,image_url,unit_price::bigint,qty_ordered,total_price::bigint FROM tr_order_detail WHERE order_number=$1 ORDER BY line_number`, o.Number)
	if err != nil {
		internal(c, err)
		return
	}
	defer rows.Close()
	o.Items = []OrderItem{}
	for rows.Next() {
		var it OrderItem
		if err = rows.Scan(&it.SKU, &it.Name, &it.Image, &it.Price, &it.Quantity, &it.Total); err != nil {
			internal(c, err)
			return
		}
		o.Items = append(o.Items, it)
	}
	if rows.Err() != nil {
		internal(c, rows.Err())
		return
	}
	c.JSON(200, o)
}
func migrate(ctx context.Context, db *pgxpool.Pool) error {
	for _, name := range []string{"db/001_schema.sql", "db/002_seed.sql"} {
		b, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err = db.Exec(ctx, string(b)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}
func main() {
	_ = godotenv.Load()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL wajib diisi. Salin .env.example ke .env.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	db, err := pgxpool.New(ctx, url)
	if err == nil {
		err = db.Ping(ctx)
	}
	cancel()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err = migrate(context.Background(), db); err != nil {
			log.Fatal(err)
		}
		log.Print("Schema dan seed siap.")
		return
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	origins := os.Getenv("FRONTEND_ORIGIN")
	if origins == "" {
		origins = "http://localhost:3000,http://127.0.0.1:3000"
	}
	a := newApp(db, os.Getenv("COOKIE_SECURE") == "true", origins)
	srv := &http.Server{Addr: addr, Handler: a.router(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		log.Printf("API http://%s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)
	<-done
	stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(stop)
}
