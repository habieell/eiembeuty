BEGIN;
CREATE TABLE IF NOT EXISTS ms_distributor (
 kode_distributor varchar(30) PRIMARY KEY,
 nama_distributor varchar(160) NOT NULL
);
CREATE TABLE IF NOT EXISTS ms_outlet (
 kode_outlet varchar(40) PRIMARY KEY,
 nama_outlet varchar(160) NOT NULL,
 kode_distributor varchar(30) NOT NULL REFERENCES ms_distributor,
 UNIQUE(kode_outlet,kode_distributor)
);
CREATE TABLE IF NOT EXISTS ms_user (
 phone_number varchar(16) PRIMARY KEY,
 user_name varchar(100) NOT NULL,
 user_password varchar(100) NOT NULL,
 kode_outlet varchar(40) NOT NULL,
 kode_distributor varchar(30) NOT NULL,
 FOREIGN KEY(kode_outlet,kode_distributor) REFERENCES ms_outlet(kode_outlet,kode_distributor)
);
CREATE TABLE IF NOT EXISTS ms_product (
 kode_sku varchar(30) PRIMARY KEY,
 nama_sku varchar(160) NOT NULL,
 image_url text NOT NULL,
 harga_jual numeric(14,0) NOT NULL CHECK(harga_jual>0)
);
CREATE TABLE IF NOT EXISTS tr_order_header (
 order_number varchar(64) PRIMARY KEY,
 order_date timestamptz NOT NULL DEFAULT now(),
 phone_number varchar(16) NOT NULL REFERENCES ms_user,
 kode_outlet varchar(40) NOT NULL,
 kode_distributor varchar(30) NOT NULL,
 outlet_name varchar(160) NOT NULL,
 distributor_name varchar(160) NOT NULL,
 order_status varchar(40) NOT NULL DEFAULT 'Menunggu Diproses' CHECK(order_status IN ('Menunggu Diproses','Diproses','Selesai')),
 idempotency_key varchar(64) NOT NULL,
 UNIQUE(phone_number,idempotency_key),
 FOREIGN KEY(kode_outlet,kode_distributor) REFERENCES ms_outlet(kode_outlet,kode_distributor)
);
CREATE TABLE IF NOT EXISTS tr_order_detail (
 order_number varchar(64) NOT NULL REFERENCES tr_order_header ON DELETE CASCADE,
 line_number integer NOT NULL CHECK(line_number>0),
 kode_sku varchar(30) NOT NULL REFERENCES ms_product,
 product_name varchar(160) NOT NULL,
 image_url text NOT NULL,
 qty_ordered integer NOT NULL CHECK(qty_ordered BETWEEN 1 AND 999),
 unit_price numeric(14,0) NOT NULL CHECK(unit_price>0),
 total_price numeric(18,0) NOT NULL CHECK(total_price=qty_ordered*unit_price),
 PRIMARY KEY(order_number,line_number),
 UNIQUE(order_number,kode_sku)
);
CREATE INDEX IF NOT EXISTS orders_user_date ON tr_order_header(phone_number,order_date DESC);
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash char(64) PRIMARY KEY,
 phone_number varchar(16) NOT NULL REFERENCES ms_user ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON user_sessions(expires_at);
COMMIT;
