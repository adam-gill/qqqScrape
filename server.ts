import express from "express";
import cors from "cors";
import { getHoldingsData } from "./lib/scraper";


const PORT = process.env.PORT || 3000;

// Set up Express server
const app = express();

// Enable CORS
app.use(cors());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API endpoints - directly implement them the same way as in qqqScrape.ts
app.get("/holdings", async (req, res) => {
  try {
    const data = await getHoldingsData();
    res.json(data);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch holdings data", message: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Also support the /api/* routes for compatibility with Vercel
app.get("/api/holdings", async (req, res) => {
  try {
    const data = await getHoldingsData();
    res.json(data);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch holdings data", message: error.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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
