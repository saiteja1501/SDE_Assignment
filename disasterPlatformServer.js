// disasterPlatformServer.js

const express = require("express");
const bodyParser = require("body-parser");
const { Server } = require("socket.io");
const http = require("http");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// === Supabase Setup ===
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_KEY = "your-service-role-key";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === Express Setup ===
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(bodyParser.json());

// === Middleware: Supabase Cache Checker ===
async function checkCache(req, res, next) {
  const key = req.originalUrl;
  const { data, error } = await supabase
    .from("cache")
    .select("value, expires_at")
    .eq("key", key)
    .maybeSingle();

  if (data && new Date(data.expires_at) > new Date()) {
    return res.json(data.value);
  }

  res.locals.cacheKey = key;
  next();
}

async function updateCache(key, value) {
  await supabase.from("cache").upsert({
    key,
    value,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
  });
}

// === Routes ===
app.post("/disasters", async (req, res) => {
  const { title, location_name, description, tags, owner_id } = req.body;
  const { data, error } = await supabase.from("disasters").insert([
    {
      title,
      location_name,
      description,
      tags,
      owner_id,
      created_at: new Date().toISOString(),
      audit_trail: [{ action: "create", user_id: owner_id, timestamp: new Date().toISOString() }]
    }
  ]);
  if (error) return res.status(500).json(error);
  io.emit("disaster_updated", data);
  res.json(data);
});

app.get("/disasters", async (req, res) => {
  const tag = req.query.tag;
  const query = supabase.from("disasters").select("*");
  if (tag) query.contains("tags", [tag]);
  const { data, error } = await query;
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.get("/disasters/:id/social-media", async (req, res) => {
  const mockPosts = [
    { post: "#flood Need food urgently in NYC", user: "citizen1" },
    { post: "#earthquake need shelter!", user: "local2" }
  ];
  res.json(mockPosts);
});

app.get("/disasters/:id/resources", async (req, res) => {
  const { lat, lon } = req.query;
  const { data, error } = await supabase.rpc("get_resources_within_distance", {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    distance_km: 10
  });
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.get("/disasters/:id/official-updates", checkCache, async (req, res) => {
  const updates = [];
  try {
    const response = await fetch("https://www.redcross.org/");
    const html = await response.text();
    const $ = cheerio.load(html);
    $(".disaster-info").each((i, el) => {
      updates.push({ title: $(el).text().trim() });
    });
    await updateCache(res.locals.cacheKey, updates);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: "Scrape failed" });
  }
});

app.post("/disasters/:id/verify-image", async (req, res) => {
  const { image_url } = req.body;
  // Placeholder Gemini verification prompt
  const analysis = { verified: true, note: "No manipulation detected." };
  res.json(analysis);
});

app.post("/geocode", async (req, res) => {
  const { description } = req.body;
  // 1. Gemini location extraction placeholder
  const locationName = "Manhattan, NYC";

  // 2. Mapbox geocoding (replace with real API call)
  const location = { lat: 40.7831, lon: -73.9712 };
  res.json({ locationName, ...location });
});

// === WebSocket Real-Time ===
io.on("connection", socket => {
  console.log("Client connected");
  socket.on("disconnect", () => console.log("Client disconnected"));
});

// === Start Server ===
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                                   
