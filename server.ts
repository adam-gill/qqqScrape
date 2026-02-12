import express from "express";
import cors from "cors";
import { getHoldingsData } from "./lib/scraper";
import { agPicks } from "./lib/config";
import path from "path";

const PORT = process.env.PORT || 3000;

// Set up Express server
const app = express();

// Enable CORS
app.use(cors());

// Serve static files from public directory
// In production (compiled), __dirname is 'dist', so go up one level
const publicPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, "..", "public")
  : path.join(__dirname, "public");
app.use(express.static(publicPath));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API endpoints - directly implement them the same way as in qqqScrape.ts
app.get("/holdings", async (req, res) => {
  try {
    const result = await getHoldingsData();
    const responseData = {
      ...result.data,
      agPicks,
      lastUpdated: new Date(result.fetchedAt).toISOString()
    };
    res.json(responseData);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch holdings data", message: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Also support the /api/* routes for compatibility
app.get("/api/holdings", async (req, res) => {
  try {
    const result = await getHoldingsData();
    const responseData = {
      ...result.data,
      agPicks,
      lastUpdated: new Date(result.fetchedAt).toISOString()
    };
    res.json(responseData);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch holdings data", message: error.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Explicit handler for root path (fallback if static serving doesn't work)
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Local development server running at http://localhost:${PORT}`);
  console.log(`- Holdings endpoint: http://localhost:${PORT}/holdings`);
  console.log(`- Health endpoint: http://localhost:${PORT}/health`);

  // Initial data fetch just like in qqqScrape.ts
  getHoldingsData().catch((error) => {
    console.error("Initial data fetch failed:", error);
  });
});
