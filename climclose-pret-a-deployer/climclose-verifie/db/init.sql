-- ClimClose - schema + seed data (mock, for local testing only)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand_partner TEXT NOT NULL,           -- e.g. Boulanger, Darty, Leroy Merlin
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geog GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  retailer_url TEXT NOT NULL,            -- deep link base for click & collect
  source_type TEXT NOT NULL DEFAULT 'api' -- 'api' | 'scrape' | 'community'
);

CREATE INDEX stores_geog_idx ON stores USING GIST (geog);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  btu INTEGER NOT NULL,
  cooling_capacity_m2 INTEGER NOT NULL,
  noise_db INTEGER,
  image_url TEXT
);

CREATE TABLE stock_entries (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(8,2) NOT NULL,
  quantity_hint TEXT NOT NULL DEFAULT 'few', -- 'many' | 'few' | 'last_unit'
  source TEXT NOT NULL DEFAULT 'api',        -- 'api' | 'scrape' | 'community'
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.90, -- 0..1
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_reports (
  id SERIAL PRIMARY KEY,
  stock_entry_id INTEGER REFERENCES stock_entries(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- 'confirmed' | 'out_of_stock' | 'last_unit'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 10,
  min_btu INTEGER,
  max_price NUMERIC(8,2),
  brand TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === Seed data: Paris area, for local demo purposes ===

INSERT INTO products (brand, model, btu, cooling_capacity_m2, noise_db, image_url) VALUES
('Klarstein', 'WhirlWind 9000', 9000, 25, 52, null),
('De''Longhi', 'Pinguino PAC N81', 8000, 20, 51, null),
('Electrolux', 'EXP26U558CW', 12000, 34, 49, null),
('Whynter', 'ARC-14S', 14000, 40, 56, null),
('Comfee', 'MPPHA-08CRN7', 8000, 22, 53, null),
('Klarstein', 'Iceblock Eco', 7000, 18, 50, null),
('LG', 'PuriCool P09EN', 9000, 24, 48, null),
('Honeywell', 'HL14CESWK', 14000, 42, 55, null);

INSERT INTO stores (name, brand_partner, address, lat, lng, retailer_url, source_type) VALUES
('Boulanger République', 'Boulanger', '12 Rue du Temple, 75003 Paris', 48.8635, 2.3614, 'https://www.boulanger.com/c/climatiseurs', 'api'),
('Darty Bercy', 'Darty', '2 Cour Saint-Emilion, 75012 Paris', 48.8347, 2.3874, 'https://www.darty.com/nav/achat/climatisation', 'api'),
('Leroy Merlin Rosny', 'Leroy Merlin', '1 Place Vermeer, 93110 Rosny-sous-Bois', 48.8724, 2.4869, 'https://www.leroymerlin.fr/produits/climatisation', 'scrape'),
('Boulanger Ivry', 'Boulanger', '36 Avenue de la République, 94200 Ivry-sur-Seine', 48.8156, 2.3903, 'https://www.boulanger.com/c/climatiseurs', 'api'),
('Darty Montparnasse', 'Darty', '20 Rue du Départ, 75014 Paris', 48.8422, 2.3212, 'https://www.darty.com/nav/achat/climatisation', 'api'),
('Cdiscount Store Aubervilliers', 'Cdiscount', '165 Avenue Jean Jaurès, 93300 Aubervilliers', 48.9109, 2.3831, 'https://www.cdiscount.com/electromenager/climatisation', 'scrape'),
('Leroy Merlin Nation', 'Leroy Merlin', '80 Cours de Vincennes, 75012 Paris', 48.8476, 2.4004, 'https://www.leroymerlin.fr/produits/climatisation', 'scrape'),
('Boulanger Vélizy 2', 'Boulanger', 'Centre Commercial Vélizy 2, 78140 Vélizy-Villacoublay', 48.7823, 2.1958, 'https://www.boulanger.com/c/climatiseurs', 'api');

-- Stock entries: cross a subset of stores x products with varied price/confidence
INSERT INTO stock_entries (store_id, product_id, price, quantity_hint, source, confidence_score, last_verified_at) VALUES
(1, 1, 349.90, 'few', 'api', 0.95, now() - interval '10 minutes'),
(1, 3, 499.00, 'many', 'api', 0.97, now() - interval '10 minutes'),
(2, 2, 379.00, 'few', 'api', 0.93, now() - interval '25 minutes'),
(2, 4, 549.00, 'last_unit', 'api', 0.88, now() - interval '5 minutes'),
(3, 5, 329.00, 'few', 'scrape', 0.72, now() - interval '2 hours'),
(3, 6, 299.00, 'many', 'scrape', 0.70, now() - interval '2 hours'),
(4, 1, 359.00, 'few', 'api', 0.94, now() - interval '15 minutes'),
(4, 7, 419.00, 'many', 'api', 0.96, now() - interval '15 minutes'),
(5, 3, 489.00, 'last_unit', 'api', 0.85, now() - interval '8 minutes'),
(5, 8, 599.00, 'few', 'api', 0.90, now() - interval '8 minutes'),
(6, 2, 359.00, 'few', 'scrape', 0.55, now() - interval '6 hours'),
(6, 5, 309.00, 'last_unit', 'scrape', 0.50, now() - interval '6 hours'),
(7, 4, 529.00, 'many', 'scrape', 0.68, now() - interval '3 hours'),
(7, 6, 289.00, 'few', 'scrape', 0.74, now() - interval '3 hours'),
(8, 7, 399.00, 'many', 'api', 0.92, now() - interval '20 minutes'),
(8, 8, 579.00, 'few', 'api', 0.91, now() - interval '20 minutes');
