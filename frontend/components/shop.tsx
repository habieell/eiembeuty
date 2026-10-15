"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  rupiah,
  date,
  type User,
  type Product,
  type Line,
  type Order,
} from "../lib/api";

type Cart = Record<string, number>;
type Context = {
  user: User;
  products: Product[];
  cart: Cart;
  setQty: (sku: string, n: number) => void;
  notify: (s: string) => void;
  refresh: () => void;
  clear: () => void;
};
const Store = createContext<Context | null>(null);
const useShop = () => useContext(Store)!;
const errors = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan. Silakan coba lagi.";
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    bag: (
      <>
        <path d="M5 7h14l1 14H4L5 7Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    exit: (
      <>
        <path d="M9 4H4v16h5M12 12h9m-4-4 4 4-4 4" />
      </>
    ),
    store: (
      <>
        <path d="m4 4-2 6 3 3 4-3 3 3 4-3 3 3 3-3-2-6H4ZM5 13v8h14v-8M9 21v-6h6v6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.bag}
    </svg>
  );
}
function Brand() {
  return (
    <span className="brand">
      <img
        src="/assets/logo.png"
        alt="ei.embeauty — you deserve better"
        width="230"
        height="65"
      />
    </span>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Memuat…
    </div>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty card">
      <span className="round-icon">
        <Icon name="bag" size={30} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function Retry({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn secondary" onClick={onClick}>
      Coba lagi
    </button>
  );
}

export default function Shop() {
  const pathname = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [authError, setAuthError] = useState("");
  const [products, setProducts] = useState<Product[]>([]),
    [productError, setProductError] = useState(""),
    [cart, setCart] = useState<Cart>({}),
    [toast, setToast] = useState(""),
    [cartReady, setCartReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const publicPage =
    pathname === "/" || pathname === "/login" || pathname === "/register";
  useEffect(() => {
    let active = true;
    setAuthError("");
    api<User>("/auth/me")
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active && (!(e instanceof ApiError) || e.status !== 401))
          setAuthError(errors(e));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    if (ready && !authError) {
      if (!user && !publicPage) router.replace("/login");
      if (user && publicPage) router.replace("/dashboard");
    }
  }, [ready, user, publicPage, router, authError]);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setCart({});
      setCartReady(false);
      setToast("Sesi berakhir. Silakan masuk kembali.");
      router.replace("/login");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [router]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setProductError("");
    api<Product[]>("/products")
      .then((p) => {
        if (active) setProducts(p);
      })
      .catch((e) => {
        if (active) setProductError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [user, retry]);
  useEffect(() => {
    if (!user) return;
    let saved: Cart = {};
    try {
      const value = JSON.parse(
        localStorage.getItem(`eiem-cart-${user.phone_number}`) || "{}",
      );
      if (value && typeof value === "object" && !Array.isArray(value))
        for (const [sku, qty] of Object.entries(value))
          if (
            /^EI-A0[123]$/.test(sku) &&
            Number.isInteger(qty) &&
            Number(qty) > 0 &&
            Number(qty) <= 999
          )
            saved[sku] = Number(qty);
    } catch {}
    setCart(saved);
    setCartReady(true);
  }, [user]);
  useEffect(() => {
    if (user && cartReady)
      try {
        localStorage.setItem(
          `eiem-cart-${user.phone_number}`,
          JSON.stringify(cart),
        );
      } catch {}
  }, [cart, user, cartReady]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function setQty(sku: string, n: number) {
    if (!Number.isInteger(n) || n < 0 || n > 999) return;
    setCart((old) => {
      const next = { ...old };
      if (n === 0) delete next[sku];
      else next[sku] = n;
      return next;
    });
    if (user)
      try {
        sessionStorage.removeItem(`eiem-checkout-${user.phone_number}`);
      } catch {}
  }
  const refresh = () => setRetry((n) => n + 1);
  if (!ready) return <Loading />;
  if (authError)
    return (
      <main className="auth">
        <Brand />
        <ErrorBox message={`API belum dapat dihubungi. ${authError}`} />
        <Retry onClick={refresh} />
      </main>
    );
  const notification = toast && (
    <div className="toast" role="status">
      <Icon name="check" />
      {toast}
    </div>
  );
  if (!user) {
    if (!publicPage) return <Loading />;
    return (
      <>
        <Auth register={pathname === "/register"} onLogin={setUser} />
        {notification}
      </>
    );
  }
  if (publicPage || !cartReady) return <Loading />;
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const titles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/products": "Buat Pesanan",
    "/cart": "Keranjang",
    "/checkout": "Checkout",
    "/orders": "Riwayat Pesanan",
  };
  const title =
    titles[pathname] ||
    (pathname.startsWith("/orders/")
      ? "Detail Pesanan"
      : "Halaman Tidak Ditemukan");
  const nav = [
    ["/dashboard", "home", "Beranda"],
    ["/products", "bag", "Buat Pesanan"],
    ["/orders", "clock", "Riwayat"],
  ];
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setCart({});
      setCartReady(false);
      router.replace("/login");
    } catch (e) {
      setToast(errors(e));
    }
  }
  return (
    <Store.Provider
      value={{
        user,
        products,
        cart,
        setQty,
        notify: setToast,
        refresh,
        clear: () => {
          setCart({});
          try {
            localStorage.removeItem(`eiem-cart-${user.phone_number}`);
          } catch {}
        },
      }}
    >
      <a className="skip" href="#content">
        Lewati ke konten
      </a>
      <header className="header">
        <div className="header-inner">
          <Link href="/dashboard" aria-label="eiem.beauty beranda">
            <Brand />
          </Link>
          <nav aria-label="Navigasi utama">
            {nav.map(([href, icon, label]) => (
              <Link
                key={href}
                className={pathname === href ? "active" : ""}
                href={href}
              >
                <Icon name={icon} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link
              className="cart-link"
              href="/cart"
              aria-label={`Keranjang, ${count} produk`}
            >
              <Icon name="bag" />
              <span className="cart-label">Keranjang</span>
              <b>{count}</b>
            </Link>
            <button className="logout" onClick={logout} aria-label="Keluar">
              <Icon name="exit" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>
      <main id="content" className="container">
        <div className="page-top">
          <div>
            <p className="eyebrow">PORTAL MITRA · EIEM.BEAUTY</p>
            <h1>{title}</h1>
          </div>
          {pathname !== "/dashboard" && (
            <Link
              className="back"
              href={pathname === "/checkout" ? "/cart" : "/dashboard"}
            >
              ← Kembali
            </Link>
          )}
        </div>
        {productError ? (
          <>
            <ErrorBox message={productError} />
            <Retry onClick={refresh} />
          </>
        ) : products.length === 0 ? (
          <Loading />
        ) : pathname === "/dashboard" ? (
          <Dashboard />
        ) : pathname === "/products" ? (
          <Catalog />
        ) : pathname === "/cart" ? (
          <CartPage />
        ) : pathname === "/checkout" ? (
          <Checkout />
        ) : pathname === "/orders" ? (
          <History />
        ) : pathname.startsWith("/orders/") ? (
          <Detail number={decodeURIComponent(pathname.slice(8))} />
        ) : (
          <Empty title="Halaman tidak ditemukan">
            <Link href="/dashboard">Kembali ke beranda</Link>
          </Empty>
        )}
        <footer>
          eiem.beauty <span>you deserve better</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Navigasi ponsel">
        {nav.map(([href, icon, label]) => (
          <Link
            key={href}
            className={pathname === href ? "active" : ""}
            href={href}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </Link>
        ))}
        <Link className={pathname === "/cart" ? "active" : ""} href="/cart">
          <Icon name="bag" />
          <span>Keranjang ({count})</span>
        </Link>
      </nav>
      {notification}
    </Store.Provider>
  );
}

type Distributor = { kode_distributor: string; nama_distributor: string };
type Outlet = { kode_outlet: string; nama_outlet: string };
function Auth({
  register,
  onLogin,
}: {
  register: boolean;
  onLogin: (u: User) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  const [distributors, setDistributors] = useState<Distributor[]>([]),
    [outlets, setOutlets] = useState<Outlet[]>([]),
    [dist, setDist] = useState(""),
    [outlet, setOutlet] = useState(""),
    [loadingOutlets, setLoadingOutlets] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [lookupRetry, setLookupRetry] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setError("");
    form.current?.reset();
    setDist("");
    setOutlet("");
    if (!register)
      try {
        if (sessionStorage.getItem("eiem-registered")) {
          setSuccess(
            "Registrasi berhasil. Silakan masuk dengan akun baru Anda.",
          );
          sessionStorage.removeItem("eiem-registered");
        }
      } catch {}
  }, [register]);
  useEffect(() => {
    if (!register) return;
    let active = true;
    setLookupError("");
    api<Distributor[]>("/distributors")
      .then((d) => {
        if (active) setDistributors(d);
      })
      .catch((e) => {
        if (active) setLookupError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [register, lookupRetry]);
  useEffect(() => {
    setOutlet("");
    setOutlets([]);
    if (!dist) return;
    let active = true;
    setLoadingOutlets(true);
    setLookupError("");
    api<Outlet[]>(`/outlets?distributor=${encodeURIComponent(dist)}`)
      .then((o) => {
        if (active) setOutlets(o);
      })
      .catch((e) => {
        if (active) setLookupError(errors(e));
      })
      .finally(() => {
        if (active) setLoadingOutlets(false);
      });
    return () => {
      active = false;
    };
  }, [dist, lookupRetry]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const phone = String(data.get("phone")),
      password = String(data.get("password"));
    try {
      if (register) {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            phone_number: phone,
            password,
            user_name: data.get("name"),
            kode_distributor: dist,
            kode_outlet: outlet,
          }),
        });
        try {
          sessionStorage.setItem("eiem-registered", "1");
        } catch {}
        setSuccess("Registrasi berhasil. Silakan masuk dengan akun baru Anda.");
        router.push("/login");
      } else {
        const u = await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ phone_number: phone, password }),
        });
        onLogin(u);
        router.push("/dashboard");
      }
    } catch (e) {
      setError(errors(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">UNTUK MITRA EIEM.BEAUTY</p>
          <h1>
            Perawatan terbaik.
            <br />
            Pemesanan lebih mudah.
          </h1>
          <p>
            Lengkapi koleksi serum di outlet Anda, dalam beberapa langkah
            sederhana.
          </p>
        </div>
        <div className="auth-products">
          {["acne", "hydration", "brightening"].map((s) => (
            <img key={s} src={`/assets/${s}-serum.png`} alt="" />
          ))}
        </div>
        <p className="story-bottom">Your next beautiful beginning.</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <span className="round-icon">
            <Icon name={register ? "store" : "spark"} size={27} />
          </span>
          <p className="eyebrow">SELAMAT DATANG, MITRA</p>
          <h1>{register ? "Registrasi Akun Baru" : "Masuk ke akun Anda"}</h1>
          <p className="muted">
            {register
              ? "Daftarkan outlet Anda untuk mulai melakukan pemesanan."
              : "Masukkan nomor handphone dan password Anda."}
          </p>
          <ErrorBox message={error} />
          {success && (
            <p role="status" className="success">
              {success}
            </p>
          )}
          <form ref={form} onSubmit={submit}>
            <label>
              Nomor Handphone
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="081234567890"
                required
                maxLength={30}
              />
            </label>
            {register && (
              <label>
                Nama
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Nama lengkap Anda"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={
                  register ? "Minimal 8 karakter" : "Masukkan password"
                }
                required
                minLength={register ? 8 : 1}
                maxLength={72}
              />
            </label>
            {register && (
              <>
                <label>
                  Distributor
                  <select
                    aria-label="Distributor"
                    value={dist}
                    onChange={(e) => setDist(e.target.value)}
                    required
                  >
                    <option value="">Pilih Distributor</option>
                    {distributors.map((d) => (
                      <option
                        key={d.kode_distributor}
                        value={d.kode_distributor}
                      >
                        {d.nama_distributor}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Outlet
                  <select
                    aria-label="Outlet"
                    value={outlet}
                    onChange={(e) => setOutlet(e.target.value)}
                    required
                    disabled={!dist || loadingOutlets}
                  >
                    <option value="">
                      {loadingOutlets
                        ? "Memuat outlet…"
                        : !dist
                          ? "Pilih distributor terlebih dahulu"
                          : "Pilih Outlet"}
                    </option>
                    {outlets.map((o) => (
                      <option key={o.kode_outlet} value={o.kode_outlet}>
                        {o.nama_outlet}
                      </option>
                    ))}
                  </select>
                </label>
                {dist &&
                  !loadingOutlets &&
                  outlets.length === 0 &&
                  !lookupError && (
                    <p className="muted">
                      Tidak ada outlet untuk distributor ini.
                    </p>
                  )}
                <ErrorBox message={lookupError} />
                {lookupError && (
                  <Retry onClick={() => setLookupRetry((n) => n + 1)} />
                )}
              </>
            )}
            <button
              className="btn full"
              disabled={
                busy || (register && (!dist || !outlet || loadingOutlets))
              }
              type="submit"
            >
              {busy ? "Mohon tunggu…" : register ? "Daftar" : "Masuk"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Sudah punya akun?" : "Belum terdaftar?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Masuk di sini" : "Daftar di sini"}
            </Link>
          </p>
          <p className="auth-foot">
            Pemesanan khusus mitra outlet dan distributor.
          </p>
        </div>
      </section>
    </main>
  );
}
function OutletInfo() {
  const { user } = useShop();
  return (
    <div className="outlet-info">
      <span className="round-icon">
        <Icon name="store" />
      </span>
      <div>
        <span className="eyebrow">OUTLET ANDA</span>
        <strong>{user.outlet_name}</strong>
        <small>
          {user.kode_outlet} · {user.distributor_name}
        </small>
      </div>
    </div>
  );
}
function Dashboard() {
  const { user } = useShop();
  const [orders, setOrders] = useState<Order[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [saved, setSaved] = useState("");
  useEffect(() => {
    try {
      setSaved(
        sessionStorage.getItem(`eiem-last-order-${user.phone_number}`) || "",
      );
    } catch {}
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    api<Order[]>("/orders")
      .then((o) => {
        if (active) setOrders(o);
      })
      .catch((e) => {
        if (active) setError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <>
      {saved && (
        <div className="success" role="status">
          <Icon name="check" /> Pesanan berhasil disimpan.{" "}
          <Link href={`/orders/${saved}`}>Lihat detail pesanan →</Link>
        </div>
      )}
      <section className="welcome">
        <div>
          <p className="eyebrow">SENANG BERTEMU ANDA KEMBALI</p>
          <h2>Halo, {user.user_name}.</h2>
          <p>
            Siap melengkapi stok kecantikan
            <br className="desktop-break" /> untuk pelanggan Anda?
          </p>
          <Link href="/products" className="btn">
            Buat Pesanan <Icon name="arrow" />
          </Link>
        </div>
        <div className="hero-products">
          {["acne", "hydration", "brightening"].map((s) => (
            <img key={s} src={`/assets/${s}-serum.png`} alt="" />
          ))}
        </div>
        <span className="hero-mark">
          daily care,
          <br />
          beautifully simple.
        </span>
      </section>
      <div className="dashboard-info">
        <section className="card account">
          <OutletInfo />
          <dl>
            <div>
              <dt>Nomor handphone</dt>
              <dd>{user.phone_number}</dd>
            </div>
            <div>
              <dt>Distributor</dt>
              <dd>{user.distributor_name}</dd>
            </div>
          </dl>
        </section>
        <Link href="/orders" className="card history-shortcut">
          <span className="round-icon">
            <Icon name="clock" />
          </span>
          <div>
            <span className="eyebrow">PESANAN ANDA</span>
            <h3>Riwayat Pesanan</h3>
            <p className="muted">Pantau dan lihat kembali pesanan Anda.</p>
          </div>
          <Icon name="arrow" />
        </Link>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>Pesanan terbaru</h2>
          <Link href="/orders">
            Lihat semua <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {error ? (
          <>
            <ErrorBox message={error} />
            <Retry onClick={() => setRetry((n) => n + 1)} />
          </>
        ) : orders === null ? (
          <Loading />
        ) : orders.length === 0 ? (
          <Empty title="Belum ada pesanan">
            <p className="muted">Pesanan pertama Anda dimulai dari sini.</p>
            <Link href="/products" className="btn secondary">
              Jelajahi Produk <Icon name="arrow" />
            </Link>
          </Empty>
        ) : (
          <div className="order-grid">
            {orders.slice(0, 2).map((o) => (
              <OrderCard key={o.order_number} order={o} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
const productNotes: Record<string, [string, string]> = {
  "EI-A01": [
    "ACNE + ANTI-AGING",
    "Perawatan untuk kulit berjerawat dan tanda penuaan.",
  ],
  "EI-A02": [
    "HYDRATION BOOSTER",
    "Lengkapi rutinitas hidrasi kulit sehari-hari.",
  ],
  "EI-A03": ["BRIGHTENING", "Temani perawatan kulit agar tampak lebih cerah."],
};
function Catalog() {
  const { products, cart } = useShop();
  const n = Object.values(cart).reduce((a, b) => a + b, 0);
  return (
    <>
      <OutletInfo />
      <div className="section-head catalog-intro">
        <div>
          <p className="eyebrow">THE DAILY SERUM COLLECTION</p>
          <h2>Perawatan kecil, pilihan berarti.</h2>
          <p className="muted">Pilih produk dan jumlah yang ingin dipesan.</p>
        </div>
        <Link className="btn secondary desktop-cart" href="/cart">
          <Icon name="bag" /> Keranjang ({n})
        </Link>
      </div>
      <div className="products-grid">
        {products.map((p, i) => (
          <ProductCard key={p.kode_sku} product={p} index={i} />
        ))}
      </div>
      <Link href="/cart" className="catalog-cart btn">
        Lihat Keranjang ({n})<Icon name="arrow" />
      </Link>
    </>
  );
}
function ProductCard({
  product: p,
  index,
}: {
  product: Product;
  index: number;
}) {
  const { cart, setQty, notify } = useShop();
  const [qty, setQuantity] = useState("1");
  const amount = Number(qty),
    valid = Number.isInteger(amount) && amount >= 1 && amount <= 999;
  const inCart = cart[p.kode_sku] || 0;
  const note = productNotes[p.kode_sku];
  return (
    <article className={`product-card card tone-${index}`}>
      <div className="product-photo">
        <span className="product-volume">20 ML / SERUM</span>
        <img src={p.image_url} alt={p.nama_sku} />
        {inCart > 0 && (
          <span className="in-cart">
            <Icon name="check" size={14} />
            {inCart} di keranjang
          </span>
        )}
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span>{p.kode_sku}</span>
          <span>{note?.[0]}</span>
        </div>
        <h3>{p.nama_sku}</h3>
        <p className="muted product-note">{note?.[1]}</p>
        <p className="price">{rupiah(p.harga_jual)}</p>
        <div className="add-row">
          <label className="qty-label">
            <span className="sr-only">Jumlah {p.kode_sku}</span>
            <input
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <button
            className="btn"
            disabled={!valid || inCart + amount > 999}
            onClick={() => {
              setQty(p.kode_sku, inCart + amount);
              notify(`${amount} produk ditambahkan ke keranjang.`);
            }}
          >
            <Icon name="plus" size={18} />
            Tambah ke Keranjang
          </button>
        </div>
        {inCart + amount > 999 && (
          <small className="error-text">Maksimal 999 unit per produk.</small>
        )}
      </div>
    </article>
  );
}
function useLines() {
  const { products, cart } = useShop();
  return products
    .filter((p) => cart[p.kode_sku])
    .map((p) => ({
      ...p,
      quantity: cart[p.kode_sku],
      total_price: p.harga_jual * cart[p.kode_sku],
    }));
}
function Steps({ step }: { step: number }) {
  return (
    <ol className="steps">
      {["Pilih Produk", "Keranjang", "Checkout"].map((s, i) => (
        <li key={s} className={step >= i ? "current" : ""}>
          <span>{step > i ? <Icon name="check" size={14} /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
function CartPage() {
  const lines = useLines();
  const { setQty } = useShop();
  return (
    <>
      <Steps step={1} />
      {lines.length === 0 ? (
        <Empty title="Keranjang masih kosong">
          <p className="muted">
            Pilih serum favorit untuk mulai membuat pesanan.
          </p>
          <Link href="/products" className="btn">
            Pilih Produk <Icon name="arrow" />
          </Link>
        </Empty>
      ) : (
        <div className="two-column">
          <section className="cart-items">
            {lines.map((it) => (
              <article className="card cart-item" key={it.kode_sku}>
                <img src={it.image_url} alt={it.nama_sku} />
                <div className="cart-item-content">
                  <span className="eyebrow">{it.kode_sku}</span>
                  <h2>{it.nama_sku}</h2>
                  <p className="muted">{rupiah(it.harga_jual)} / unit</p>
                  <div className="item-bottom">
                    <div className="stepper">
                      <button
                        aria-label={`Kurangi ${it.kode_sku}`}
                        onClick={() => setQty(it.kode_sku, it.quantity - 1)}
                      >
                        −
                      </button>
                      <input
                        aria-label={`Jumlah ${it.kode_sku}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        value={it.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n >= 1 && n <= 999) setQty(it.kode_sku, n);
                        }}
                      />
                      <button
                        aria-label={`Tambah ${it.kode_sku}`}
                        disabled={it.quantity >= 999}
                        onClick={() => setQty(it.kode_sku, it.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <strong>{rupiah(it.total_price)}</strong>
                  </div>
                  <button
                    className="remove"
                    onClick={() => setQty(it.kode_sku, 0)}
                  >
                    <Icon name="trash" size={15} />
                    Hapus {it.kode_sku}
                  </button>
                </div>
              </article>
            ))}
            <Link className="text-link" href="/products">
              ← Tambah produk lainnya
            </Link>
          </section>
          <Summary lines={lines}>
            <Link href="/checkout" className="btn full">
              Checkout <Icon name="arrow" />
            </Link>
            <p className="summary-note">
              Periksa kembali pesanan sebelum disimpan.
            </p>
          </Summary>
        </div>
      )}
    </>
  );
}
function Summary({ lines, children }: { lines: Line[]; children: ReactNode }) {
  const qty = lines.reduce((a, b) => a + b.quantity, 0),
    total = lines.reduce((a, b) => a + b.total_price, 0);
  return (
    <aside className="card summary">
      <h2>Ringkasan Pesanan</h2>
      <dl>
        <div>
          <dt>Jenis produk</dt>
          <dd>{lines.length} produk</dd>
        </div>
        <div>
          <dt>Total jumlah</dt>
          <dd>{qty} unit</dd>
        </div>
      </dl>
      <div className="grand-total">
        <span>Total Keseluruhan</span>
        <strong data-testid="grand-total">{rupiah(total)}</strong>
      </div>
      {children}
    </aside>
  );
}
function ReadonlyItems({ lines }: { lines: Line[] }) {
  return (
    <div className="readonly-items">
      {lines.map((it) => (
        <article className="readonly-item" key={it.kode_sku}>
          <img src={it.image_url} alt={it.nama_sku} />
          <div>
            <span className="eyebrow">{it.kode_sku}</span>
            <h3>{it.nama_sku}</h3>
            <p className="muted">
              {it.quantity} × {rupiah(it.harga_jual)}
            </p>
            <strong>{rupiah(it.total_price)}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}
function Checkout() {
  const { cart, user, clear } = useShop(),
    router = useRouter();
  const [quote, setQuote] = useState<{
      items: Line[];
      total_price: number;
      total_quantity: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const fingerprint = JSON.stringify(Object.entries(cart).sort());
  useEffect(() => {
    let active = true;
    setQuote(null);
    setError("");
    const parsed = JSON.parse(fingerprint) as [string, number][];
    if (!parsed.length) return;
    api<{ items: Line[]; total_price: number; total_quantity: number }>(
      "/checkout/preview",
      {
        method: "POST",
        body: JSON.stringify({
          items: parsed.map(([kode_sku, quantity]) => ({ kode_sku, quantity })),
        }),
      },
    )
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((e) => {
        if (active) setError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [fingerprint, retry]);
  async function save() {
    if (!quote || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const storageKey = `eiem-checkout-${user.phone_number}`;
      let key = "";
      try {
        const old = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (old?.fingerprint === fingerprint) key = old.key;
      } catch {}
      if (!key) {
        key = crypto.randomUUID();
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ key, fingerprint }),
          );
        } catch {}
      }
      const result = await api<{ order_number: string }>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          items: quote.items.map((it) => ({
            kode_sku: it.kode_sku,
            quantity: it.quantity,
          })),
          expected_total: quote.total_price,
        }),
      });
      clear();
      try {
        sessionStorage.setItem(
          `eiem-last-order-${user.phone_number}`,
          result.order_number,
        );
        sessionStorage.removeItem(storageKey);
      } catch {}
      router.push("/dashboard");
    } catch (e) {
      setError(errors(e));
      if (e instanceof ApiError && e.status === 409) setQuote(null);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (Object.keys(cart).length === 0)
    return (
      <Empty title="Belum ada produk untuk checkout">
        <Link className="btn" href="/products">
          Pilih Produk
        </Link>
      </Empty>
    );
  return (
    <>
      <Steps step={2} />
      <ErrorBox message={error} />
      {error && <Retry onClick={() => setRetry((n) => n + 1)} />}
      <div className="two-column">
        <section className="card checkout-review">
          <p className="eyebrow">PERIKSA SEBELUM MENYIMPAN</p>
          <h2>Konfirmasi pesanan Anda</h2>
          <OutletInfo />
          {quote ? (
            <ReadonlyItems lines={quote.items} />
          ) : !error ? (
            <Loading />
          ) : null}
        </section>
        {quote && (
          <Summary lines={quote.items}>
            <p className="summary-note">
              Pesanan akan tercatat untuk <strong>{user.outlet_name}</strong>{" "}
              dengan status Menunggu Diproses.
            </p>
            <button className="btn full" disabled={busy} onClick={save}>
              {busy ? "Menyimpan…" : "Simpan Pesanan"}
              <Icon name="check" />
            </button>
            <Link className="summary-edit" href="/cart">
              Ubah keranjang
            </Link>
          </Summary>
        )}
      </div>
    </>
  );
}
function OrderCard({ order: o }: { order: Order }) {
  return (
    <article className="card order-card">
      <div className="order-card-top">
        <span className="status">
          <i />
          {o.order_status}
        </span>
        <span className="muted">{date(o.order_date)}</span>
      </div>
      <h3>{o.order_number}</h3>
      <dl>
        <div>
          <dt>Outlet</dt>
          <dd>
            {o.kode_outlet} · {o.outlet_name}
          </dd>
        </div>
        <div>
          <dt>Distributor</dt>
          <dd>
            {o.kode_distributor} · {o.distributor_name}
          </dd>
        </div>
      </dl>
      <div className="order-card-bottom">
        <div>
          <span className="muted">{o.total_quantity} unit</span>
          <strong>{rupiah(o.total_price)}</strong>
        </div>
        <Link className="btn secondary" href={`/orders/${o.order_number}`}>
          Lihat Detail <Icon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
function History() {
  const [orders, setOrders] = useState<Order[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api<Order[]>("/orders")
      .then((o) => {
        if (active) setOrders(o);
      })
      .catch((e) => {
        if (active) setError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <>
      <p className="muted page-description">
        Semua pesanan outlet Anda tersimpan di sini.
      </p>
      {error ? (
        <>
          <ErrorBox message={error} />
          <Retry onClick={() => setRetry((n) => n + 1)} />
        </>
      ) : orders === null ? (
        <Loading />
      ) : orders.length === 0 ? (
        <Empty title="Belum ada riwayat pesanan">
          <p className="muted">
            Pesanan yang disimpan akan muncul di halaman ini.
          </p>
          <Link className="btn" href="/products">
            Buat Pesanan
          </Link>
        </Empty>
      ) : (
        <div className="order-grid">
          {orders.map((o) => (
            <OrderCard key={o.order_number} order={o} />
          ))}
        </div>
      )}
    </>
  );
}
function Detail({ number }: { number: string }) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setOrder(null);
    setError("");
    api<Order>(`/orders/${encodeURIComponent(number)}`)
      .then((o) => {
        if (active) setOrder(o);
      })
      .catch((e) => {
        if (active) setError(errors(e));
      });
    return () => {
      active = false;
    };
  }, [number, retry]);
  return error ? (
    <>
      <ErrorBox message={error} />
      <Retry onClick={() => setRetry((n) => n + 1)} />
      <Link className="text-link" href="/orders">
        Kembali ke riwayat
      </Link>
    </>
  ) : !order ? (
    <Loading />
  ) : (
    <>
      <div className="two-column">
        <section className="card checkout-review">
          <span className="status">
            <i />
            {order.order_status}
          </span>
          <h2 className="order-number">{order.order_number}</h2>
          <p className="muted">{date(order.order_date)} · WIB</p>
          <dl className="detail-meta">
            <div>
              <dt>Outlet</dt>
              <dd>
                {order.kode_outlet} · {order.outlet_name}
              </dd>
            </div>
            <div>
              <dt>Distributor</dt>
              <dd>
                {order.kode_distributor} · {order.distributor_name}
              </dd>
            </div>
          </dl>
          <ReadonlyItems lines={order.items || []} />
        </section>
        <Summary lines={order.items || []}>
          <Link href="/orders" className="btn secondary full">
            Kembali ke Riwayat
          </Link>
          <Link href="/products" className="summary-edit">
            Buat pesanan lagi →
          </Link>
        </Summary>
      </div>
    </>
  );
}
