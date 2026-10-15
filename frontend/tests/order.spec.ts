import { test, expect } from "@playwright/test";

test("registrasi → login → cart → checkout → riwayat → detail → logout", async ({
  page,
}, testInfo) => {
  const phone =
    "08" +
    String(Date.now()).slice(-7) +
    String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const password = "TestPassword123!";
  const serverErrors: string[] = [];
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
  });
  const noOverflow = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  };
  const shot = async (name: string) => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: testInfo.outputPath(name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  };
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Registrasi Akun Baru" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("Poppins");
  expect(
    await page.evaluate(() => document.fonts.check("400 14px Poppins")),
  ).toBe(true);
  await expect(page.getByLabel("Outlet", { exact: true })).toBeDisabled();
  await page.getByLabel("Nomor Handphone").fill(phone);
  await page
    .getByLabel("Nama", { exact: true })
    .fill("Mitra " + testInfo.project.name);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Distributor", { exact: true }).selectOption("STD");
  await expect(
    page.getByLabel("Outlet", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await page
    .getByLabel("Outlet", { exact: true })
    .selectOption("BAL-STD-00240");
  await page.getByLabel("Distributor", { exact: true }).selectOption("JKT");
  await expect(page.getByLabel("Outlet", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Outlet", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await expect(
    page
      .getByLabel("Outlet", { exact: true })
      .locator('option[value="BAL-STD-00240"]'),
  ).toHaveCount(0);
  await page.getByLabel("Distributor", { exact: true }).selectOption("STD");
  await expect(
    page.getByLabel("Outlet", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await page
    .getByLabel("Outlet", { exact: true })
    .selectOption("BAL-STD-00240");
  await noOverflow();
  await shot("register");
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Registrasi berhasil. Silakan masuk dengan akun baru Anda."),
  ).toBeVisible();
  await page.getByLabel("Nomor Handphone").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill("wrongpass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText(
    "Nomor handphone atau password salah",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", {
      name: `Halo, Mitra ${testInfo.project.name}.`,
    }),
  ).toBeVisible();
  await noOverflow();
  await shot("dashboard");
  await page
    .locator("#content")
    .getByRole("link", { name: "Buat Pesanan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Buat Pesanan", exact: true }),
  ).toBeVisible();
  const a01 = page
      .locator("article.product-card")
      .filter({ hasText: "EI-A01" }),
    a02 = page.locator("article.product-card").filter({ hasText: "EI-A02" }),
    a03 = page.locator("article.product-card").filter({ hasText: "EI-A03" });
  await a01.getByLabel("Jumlah EI-A01").fill("0");
  await expect(
    a01.getByRole("button", { name: "Tambah ke Keranjang" }),
  ).toBeDisabled();
  await a01.getByLabel("Jumlah EI-A01").fill("5");
  await a01.getByRole("button", { name: "Tambah ke Keranjang" }).click();
  await a02.getByRole("button", { name: "Tambah ke Keranjang" }).click();
  await a03.getByLabel("Jumlah EI-A03").fill("3");
  await a03.getByRole("button", { name: "Tambah ke Keranjang" }).click();
  await noOverflow();
  await shot("catalog");
  await page
    .locator("header")
    .getByRole("link", { name: /Keranjang, 9 produk/ })
    .click();
  await page.getByRole("button", { name: "Hapus EI-A02", exact: true }).click();
  await page
    .getByRole("button", { name: "Kurangi EI-A01", exact: true })
    .click();
  await expect(page.getByLabel("Jumlah EI-A01")).toHaveValue("4");
  await page
    .getByRole("button", { name: "Tambah EI-A01", exact: true })
    .click();
  await expect(page.getByTestId("grand-total")).toContainText("300.000");
  await page.reload();
  await expect(page.getByLabel("Jumlah EI-A01")).toHaveValue("5");
  await expect(page.getByTestId("grand-total")).toContainText("300.000");
  await noOverflow();
  await shot("cart");
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simpan Pesanan" }),
  ).toBeVisible();
  await expect(page.getByTestId("grand-total")).toContainText("300.000");
  await noOverflow();
  await shot("checkout");
  await page.getByRole("button", { name: "Simpan Pesanan" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Pesanan berhasil disimpan.")).toBeVisible();
  await expect(
    page
      .locator("header")
      .getByRole("link", { name: "Keranjang, 0 produk", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Lihat detail pesanan →" }).click();
  await expect(page).toHaveURL(/\/orders\/CAS-/);
  const detailURL = page.url();
  await expect(page.getByTestId("grand-total")).toContainText("300.000");
  await expect(
    page.getByText("Menunggu Diproses", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".readonly-item")).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId("grand-total")).toContainText("300.000");
  await noOverflow();
  await shot("detail");
  await page
    .getByRole("link", { name: "Kembali ke Riwayat", exact: true })
    .click();
  await expect(page.locator("article.order-card")).toHaveCount(1);
  await noOverflow();
  await shot("history");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(detailURL);
  await expect(page).toHaveURL(/\/login$/);
  expect(serverErrors).toEqual([]);
  expect(browserErrors).toEqual([]);
});
