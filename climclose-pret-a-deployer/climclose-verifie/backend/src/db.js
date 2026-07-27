const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://climclose:climclose@localhost:5432/climclose",
});

module.exports = { pool };
