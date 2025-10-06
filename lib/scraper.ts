import { CACHE_INTERVAL, outputFile, tableBodyClass, tickerMap, url } from "./config";

// Import puppeteer-core instead of puppeteer for serverless
let puppeteer: any;
let chromium: any = null;

try {
  // Try to use puppeteer-core for production
  puppeteer = require("puppeteer-core");
} catch (err) {
  // Fall back to regular puppeteer for local development
  puppeteer = require("puppeteer");
}

try {
  // require at runtime so local dev (without the package) still works
  chromium = require("@sparticuz/chromium");
} catch (err) {
  chromium = null;
}

// Global variable to store the holdings data - same caching mechanism
let holdingsData: any = null;
let lastFetchTime = 0;

// Use the EXACT same scraping function that works in qqqScrape.ts
export async function scrapeQQQHoldingsTable(): Promise<any> {
  let browser = null;

  try {
    console.log(`Fetching holdings data from: ${url}`);

    const launchOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    };

    // Use chromium package in production (Vercel)
    if (chromium && chromium.executablePath) {
      try {
        const executablePath = await chromium.executablePath();
        launchOptions.executablePath = executablePath;
        
        if (chromium.args && Array.isArray(chromium.args)) {
          launchOptions.args = Array.from(new Set([...launchOptions.args, ...chromium.args]));
        }
        
        launchOptions.headless = chromium.headless ?? true;
        console.log("Using @sparticuz/chromium with executablePath:", executablePath);
      } catch (chromiumError) {
        console.error("Error getting chromium executablePath:", chromiumError);
        throw new Error("Failed to initialize Chromium for serverless environment");
      }
    } else {
      console.log("@sparticuz/chromium not available; using puppeteer default");
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for the table to load
    await page
      .waitForSelector(`tbody.${tableBodyClass}`, { timeout: 30000 })
      .catch(() =>
        console.warn("Timeout waiting for table body, continuing anyway...")
      );

    // Give extra time for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Extract data from the table
    const result = await page.evaluate((tableClass) => {
      const tableBody = document.querySelector(`tbody.${tableClass}`);

      if (!tableBody) {
        return { error: `Table body with class "${tableClass}" not found` };
      }

      const rows = Array.from(tableBody.querySelectorAll("tr"));

      return {
        itemCount: rows.length,
        items: rows.map((row, index) => {
          const companyCell = row.querySelector("td:first-child span");
          const percentCell = row.querySelector("td:last-child");
          const companyName = companyCell
            ? companyCell.textContent?.trim()
            : "";
          const percentText = percentCell
            ? percentCell.textContent?.trim()
            : "0%";
          const percent = percentText
            ? parseFloat(percentText.replace("%", ""))
            : 0;

          return {
            position: index + 1,
            company: companyName,
            percent: percent,
            id: row.id || "",
          };
        }),
      };
    }, tableBodyClass);

    if (result.error) {
      throw new Error(result.error);
    }

    // Add ticker symbols to each item
    result.items = result.items?.map((item) => {
      const companyName = item.company || "";
      return {
        ...item,
        ticker: companyName
          ? tickerMap[companyName as keyof typeof tickerMap] || companyName
          : "",
      };
    });

    // Find both Google entries
    let totalGOOG = 0;
    result.items?.forEach((item: { ticker: string; percent: number }) => {
      if (item.ticker === "GOOG") {
        totalGOOG += item.percent;
      }
    });

    // Create a new array without both Google entries
    const filteredItems = result.items?.filter(
      (item: { ticker: string; }) => item.ticker !== "GOOG"
    );

    // Add the combined entry
    filteredItems?.push({
      position: filteredItems.length,
      company: "Alphabet Inc",
      ticker: "GOOG",
      percent: totalGOOG,
      id: "F00000SVTK",
    });

    // Sort by percentage (descending)
    filteredItems?.sort(
      (a: { percent: number }, b: { percent: number }) => b.percent - a.percent
    );

    // Update positions
    result.items = filteredItems?.map((item, index) => ({
      ...item,
      position: index + 1,
    }));

    console.log(
      `Combined GOOG and GOOGL into a single entry with ${totalGOOG}%`
    );

    // Return the result object for API use
    return result;
  } catch (error) {
    console.error("Error scraping QQQ holdings:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

// Function to get holdings data (with caching) - same as qqqScrape.ts
export async function getHoldingsData(): Promise<any> {
  const currentTime = Date.now();

  // If we have cached data and it's less than CACHE_INTERVAL old, use it
  if (holdingsData && currentTime - lastFetchTime < CACHE_INTERVAL) {
    console.log("Using cached holdings data");
    return holdingsData;
  }

  // Otherwise, fetch fresh data
  try {
    console.log("Fetching fresh holdings data");
    holdingsData = await scrapeQQQHoldingsTable();
    lastFetchTime = currentTime;
    return holdingsData;
  } catch (error) {
    // If there's an error fetching fresh data and we have cached data, use that
    if (holdingsData) {
      console.log("Error fetching fresh data, using cached data");
      return holdingsData;
    }
  }
}