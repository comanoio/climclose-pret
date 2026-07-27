const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Decay half-life (hours) per source — api data stays trustworthy longer than scraped data
const HALF_LIFE_HOURS = { api: 8, scrape: 2, community: 1 };

function effectiveConfidence(baseScore, source, lastVerifiedAt) {
  const ageHours = (Date.now() - new Date(lastVerifiedAt).getTime()) / 3600000;
  const halfLife = HALF_LIFE_HOURS[source] || 3;
  const decay = Math.pow(0.5, ageHours / halfLife);
  return Math.max(0, Math.min(1, baseScore * decay));
}

function freshnessLabel(score) {
  if (score >= 0.8) return "verified";
  if (score >= 0.55) return "likely";
  return "to_check";
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/meta/brands", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT DISTINCT brand FROM products ORDER BY brand");
    res.json(rows.map((r) => r.brand));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusKm = parseFloat(req.query.radius_km) || 15;
    const minBtu = req.query.min_btu ? parseInt(req.query.min_btu, 10) : null;
    const maxPrice = req.query.max_price ? parseFloat(req.query.max_price) : null;
    const brand = req.query.brand || null;
    const sort = req.query.sort || "distance"; // distance | price | btu | cooling | brand
    const minConfidence = req.query.min_confidence ? parseFloat(req.query.min_confidence) : 0.55;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const params = [lng, lat, radiusKm * 1000];
    let where = `ST_DWithin(s.geog, ST_MakePoint($1,$2)::geography, $3)`;
    let idx = 4;

    if (minBtu) {
      where += ` AND p.btu >= $${idx}`;
      params.push(minBtu);
      idx++;
    }
    if (maxPrice) {
      where += ` AND se.price <= $${idx}`;
      params.push(maxPrice);
      idx++;
    }
    if (brand) {
      where += ` AND p.brand = $${idx}`;
      params.push(brand);
      idx++;
    }

    const query = `
      SELECT
        se.id AS stock_entry_id,
        se.price, se.quantity_hint, se.source, se.confidence_score, se.last_verified_at,
        p.id AS product_id, p.brand, p.model, p.btu, p.cooling_capacity_m2, p.noise_db,
        s.id AS store_id, s.name AS store_name, s.address, s.lat, s.lng, s.retailer_url,
        ST_Distance(s.geog, ST_MakePoint($1,$2)::geography) / 1000.0 AS distance_km
      FROM stock_entries se
      JOIN products p ON p.id = se.product_id
      JOIN stores s ON s.id = se.store_id
      WHERE ${where}
      ORDER BY distance_km ASC
    `;

    const { rows } = await pool.query(query, params);

    let results = rows.map((r) => {
      const confidence = effectiveConfidence(parseFloat(r.confidence_score), r.source, r.last_verified_at);
      return {
        stockEntryId: r.stock_entry_id,
        price: parseFloat(r.price),
        quantityHint: r.quantity_hint,
        source: r.source,
        confidence: Math.round(confidence * 100) / 100,
        freshness: freshnessLabel(confidence),
        lastVerifiedAt: r.last_verified_at,
        distanceKm: Math.round(r.distance_km * 10) / 10,
        product: {
          id: r.product_id,
          brand: r.brand,
          model: r.model,
          btu: r.btu,
          coolingCapacityM2: r.cooling_capacity_m2,
          noiseDb: r.noise_db,
        },
        store: {
          id: r.store_id,
          name: r.store_name,
          address: r.address,
          lat: r.lat,
          lng: r.lng,
          retailerUrl: r.retailer_url,
        },
      };
    });

    // Filter out low-confidence / stale entries — "guaranteed stock" promise
    results = results.filter((r) => r.confidence >= minConfidence);

    const sorters = {
      distance: (a, b) => a.distanceKm - b.distanceKm,
      price: (a, b) => a.price - b.price,
      btu: (a, b) => b.product.btu - a.product.btu,
      cooling: (a, b) => b.product.coolingCapacityM2 - a.product.coolingCapacityM2,
      brand: (a, b) => a.product.brand.localeCompare(b.product.brand),
    };
    results.sort(sorters[sort] || sorters.distance);

    res.json({ count: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Community feedback: confirm stock or report out-of-stock/last unit
app.post("/api/reports", async (req, res) => {
  try {
    const { stock_entry_id, report_type } = req.body;
    if (!stock_entry_id || !["confirmed", "out_of_stock", "last_unit"].includes(report_type)) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    await pool.query(
      `INSERT INTO user_reports (stock_entry_id, report_type) VALUES ($1, $2)`,
      [stock_entry_id, report_type]
    );

    // Adjust confidence & freshness based on the report
    if (report_type === "confirmed") {
      await pool.query(
        `UPDATE stock_entries SET confidence_score = LEAST(1, confidence_score + 0.15), last_verified_at = now(), source = 'community' WHERE id = $1`,
        [stock_entry_id]
      );
    } else if (report_type === "out_of_stock") {
      await pool.query(
        `UPDATE stock_entries SET confidence_score = 0.05, last_verified_at = now(), source = 'community' WHERE id = $1`,
        [stock_entry_id]
      );
    } else if (report_type === "last_unit") {
      await pool.query(
        `UPDATE stock_entries SET quantity_hint = 'last_unit', confidence_score = GREATEST(confidence_score, 0.6), last_verified_at = now(), source = 'community' WHERE id = $1`,
        [stock_entry_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Stock alerts subscription
app.post("/api/alerts", async (req, res) => {
  try {
    const { email, lat, lng, radius_km, min_btu, max_price, brand } = req.body;
    if (!email || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "invalid_payload" });
    }
    const { rows } = await pool.query(
      `INSERT INTO alerts (email, lat, lng, radius_km, min_btu, max_price, brand)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [email, lat, lng, radius_km || 10, min_btu || null, max_price || null, brand || null]
    );
    res.json({ ok: true, alertId: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(PORT, () => {
  console.log(`ClimClose backend listening on port ${PORT}`);
});

// ---------------------------------------------------------------------------
// Link health checker: every 3h, verify each store's retailer_url is alive.
// Alive  -> refresh last_verified_at (keeps the entry visible & fresh)
// Dead   -> confidence collapses to 0.05 (entry auto-hidden by decay logic)
// "Dead" = HTTP >= 400, network error, or redirect landing on the homepage.
// ---------------------------------------------------------------------------
const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

async function checkOneLink(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ClimCloseLinkCheck/1.0)" },
    });
    if (!res.ok) return false;
    const finalPath = new URL(res.url).pathname;
    if (finalPath === "/" || finalPath === "") return false; // bounced to homepage
    return true;
  } catch {
    return false;
  }
}

async function checkAllLinks() {
  try {
    const { rows } = await pool.query("SELECT id, retailer_url FROM stores");
    for (const store of rows) {
      const alive = await checkOneLink(store.retailer_url);
      if (alive) {
        await pool.query(
          "UPDATE stock_entries SET last_verified_at = now() WHERE store_id = $1 AND confidence_score > 0.1",
          [store.id]
        );
      } else {
        await pool.query(
          "UPDATE stock_entries SET confidence_score = 0.05 WHERE store_id = $1",
          [store.id]
        );
        console.warn(`Dead link, entries hidden: store ${store.id} -> ${store.retailer_url}`);
      }
      await new Promise((r) => setTimeout(r, 2000)); // be polite between requests
    }
    console.log(`Link check done for ${rows.length} stores`);
  } catch (err) {
    console.error("Link check failed:", err);
  }
}

setTimeout(checkAllLinks, 30 * 1000); // first pass 30s after boot
setInterval(checkAllLinks, CHECK_INTERVAL_MS);
moteur-v2-a-coller-1.txt
Affichage de moteur-v2-a-coller-1.txt en cours...
