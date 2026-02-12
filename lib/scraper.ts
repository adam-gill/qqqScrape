import { tableBodyClass, tickerMap, url } from "./config";
import { getCachedHoldings, setCachedHoldings } from "./cache";
import puppeteer from "puppeteer";

// Use the EXACT same scraping function that works in qqqScrape.ts
export async function scrapeQQQHoldingsTable(): Promise<any> {
  let browser = null;

  try {
    console.log(`Fetching holdings data from: ${url}`);

    const launchOptions = {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    };

    console.log("Launching Puppeteer with Chromium");
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
    result.items = result.items?.map((item: { company: string; }) => {
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
      if (item.ticker.startsWith("GOOG")) {
        totalGOOG += item.percent;
      }
    });

    // Create a new array without both Google entries
    const filteredItems = result.items?.filter(
      (item: { ticker: string; }) => !item.ticker.startsWith("GOOG")
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
    result.items = filteredItems?.map((item: any, index: number) => ({
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

// Function to get holdings data (with SQLite caching - 24 hour validity)
export async function getHoldingsData(): Promise<{ data: any; fetchedAt: number }> {
  // Try to get cached data from SQLite
  const cachedEntry = getCachedHoldings();

  if (cachedEntry) {
    console.log("Using cached holdings data from database");
    return {
      data: cachedEntry.data,
      fetchedAt: cachedEntry.fetched_at
    };
  }

  // Otherwise, fetch fresh data
  try {
    console.log("Fetching fresh holdings data from web");
    const freshData = await scrapeQQQHoldingsTable();

    // Cache the fresh data in SQLite
    const fetchedAt = Date.now();
    setCachedHoldings(freshData);

    return {
      data: freshData,
      fetchedAt
    };
  } catch (error) {
    console.error("Error fetching fresh holdings data:", error);

    // If there's an error, try to return stale cached data if available
    const staleCache = getCachedHoldings();
    if (staleCache) {
      console.log("Error fetching fresh data, using stale cached data");
      return {
        data: staleCache.data,
        fetchedAt: staleCache.fetched_at
      };
    }

    throw error;
  }
}