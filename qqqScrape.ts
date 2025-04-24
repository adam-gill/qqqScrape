import * as fs from 'fs';
import puppeteer from 'puppeteer';
import express from 'express';
import cors from 'cors';

// Configuration
const url = 'https://www.invesco.com/qqq-etf/en/about.html';
const tableBodyClass = 'view-all-holdings__table-body';
const outputFile = 'qqq_holdings.json';
const PORT = process.env.PORT || 3000;
const CACHE_INTERVAL = 3600000; // 1 hour in milliseconds

// Define the ticker map
const tickerMap = {
    "Apple Inc": "AAPL",
    "Microsoft Corp": "MSFT",
    "NVIDIA Corp": "NVDA",
    "Amazon.com Inc": "AMZN",
    "Broadcom Inc": "AVGO",
    "Meta Platforms Inc Class A": "META",
    "Netflix Inc": "NFLX",
    "Costco Wholesale Corp": "COST",
    "Tesla Inc": "TSLA",
    "Alphabet Inc Class A": "GOOGL",
    "Alphabet Inc Class C": "GOOG",
    "T-Mobile US Inc": "TMUS",
    "Palantir Technologies Inc Ordinary Shares - Class A": "PLTR",
    "Cisco Systems Inc": "CSCO",
    "Linde PLC": "LIN",
    "PepsiCo Inc": "PEP",
    "Intuitive Surgical Inc": "ISRG",
    "Intuit Inc": "INTU",
    "Qualcomm Inc": "QCOM",
    "Booking Holdings Inc": "BKNG",
    "Adobe Inc": "ADBE",
    "Amgen Inc": "AMGN",
    "Advanced Micro Devices Inc": "AMD",
    "Texas Instruments Inc": "TXN",
    "Gilead Sciences Inc": "GILD",
    "Comcast Corp Class A": "CMCSA",
    "Honeywell International Inc": "HON",
    "Vertex Pharmaceuticals Inc": "VRTX",
    "Automatic Data Processing Inc": "ADP",
    "Applied Materials Inc": "AMAT",
    "Palo Alto Networks Inc": "PANW",
    "MercadoLibre Inc": "MELI",
    "Starbucks Corp": "SBUX",
    "Analog Devices Inc": "ADI",
    "CrowdStrike Holdings Inc Class A": "CRWD",
    "Intel Corp": "INTC",
    "KLA Corp": "KLAC",
    "Mondelez International Inc Class A": "MDLZ",
    "Lam Research Corp": "LRCX",
    "Cintas Corp": "CTAS",
    "Micron Technology Inc": "MU",
    "O'Reilly Automotive Inc": "ORLY",
    "AppLovin Corp Ordinary Shares - Class A": "APP",
    "Fortinet Inc": "FTNT",
    "Cadence Design Systems Inc": "CDNS",
    "DoorDash Inc Ordinary Shares - Class A": "DASH",
    "PDD Holdings Inc ADR": "PDD",
    "Constellation Energy Corp": "CEG",
    "Synopsys Inc": "SNPS",
    "Marriott International Inc Class A": "MAR",
    "Regeneron Pharmaceuticals Inc": "REGN",
    "PayPal Holdings Inc": "PYPL",
    "ASML Holding NV ADR": "ASML"
    // Add more as needed
};

// Global variable to store the holdings data
let holdingsData: any = null;
let lastFetchTime = 0;

/**
 * Scrapes the QQQ ETF holdings table from Invesco's website
 */
async function scrapeQQQHoldingsTable(): Promise<any> {
  let browser = null;
  
  try {
    console.log(`Fetching holdings data from: ${url}`);
    
    // Launch a headless browser
    browser = await puppeteer.launch({
      headless: true,
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for the table to load
    await page.waitForSelector(`tbody.${tableBodyClass}`, { timeout: 30000 })
      .catch(() => console.warn('Timeout waiting for table body, continuing anyway...'));
    
    // Give extra time for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract data from the table
    const result = await page.evaluate((tableClass) => {
      const tableBody = document.querySelector(`tbody.${tableClass}`);
      
      if (!tableBody) {
        return { error: `Table body with class "${tableClass}" not found` };
      }
      
      const rows = Array.from(tableBody.querySelectorAll('tr'));
      
      return {
        itemCount: rows.length,
        items: rows.map((row, index) => {
          const companyCell = row.querySelector('td:first-child span');
          const percentCell = row.querySelector('td:last-child');
          const companyName = companyCell ? companyCell.textContent?.trim() : '';
          const percentText = percentCell ? percentCell.textContent?.trim() : '0%';
          const percent = percentText ? parseFloat(percentText.replace('%', '')) : 0;
          
          return {
            position: index,
            company: companyName,
            percent: percent,
            id: row.id || ''
          };
        })
      };
    }, tableBodyClass);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // Add ticker symbols to each item
    result.items = result.items?.map(item => {
        const companyName = item.company || '';
        return {
          ...item,
          ticker: companyName ? (tickerMap[companyName as keyof typeof tickerMap] || companyName) : ''
        };
      });
    
    // Combine GOOG and GOOGL entries
    let googIndex = -1;
    let googlIndex = -1;
    let googPercent = 0;
    let googlPercent = 0;
    
    // Find both Google entries
    result.items?.forEach((item: any, index) => {
      if (item.ticker === 'GOOG') {
        googIndex = index;
        googPercent = item.percent;
      } else if (item.ticker === 'GOOGL') {
        googlIndex = index;
        googlPercent = item.percent;
      }
    });
    
    // If both exist, combine them
    if (googIndex !== -1 && googlIndex !== -1) {
      const totalPercent = googPercent + googlPercent;
      
      // Create a new array without both Google entries
      const filteredItems = result.items?.filter((_, index) => 
        index !== googIndex && index !== googlIndex
      );
      
      // Add the combined entry
      filteredItems?.push({
        position: filteredItems.length,
        company: "Alphabet Inc Class C",
        ticker: "GOOG",
        percent: totalPercent,
        id: "F00000SVTK"
      });
      
      // Sort by percentage (descending)
      filteredItems?.sort((a, b) => b.percent - a.percent);
      
      // Update positions
      result.items = filteredItems?.map((item, index) => ({
        ...item,
        position: index
      }));
      
      console.log(`Combined GOOG (${googPercent}%) and GOOGL (${googlPercent}%) into a single entry with ${totalPercent}%`);
    }
    
    // Save the data to file as backup
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(`Data saved to ${outputFile} with ${result?.items?.length} items`);
    
    // Return the result object for API use
    return result;
    
  } catch (error) {
    console.error('Error scraping QQQ holdings:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Function to get holdings data (with caching)
async function getHoldingsData(): Promise<any> {
  const currentTime = Date.now();
  
  // If we have cached data and it's less than CACHE_INTERVAL old, use it
  if (holdingsData && (currentTime - lastFetchTime < CACHE_INTERVAL)) {
    console.log('Using cached holdings data');
    return holdingsData;
  }
  
  // Otherwise, fetch fresh data
  try {
    console.log('Fetching fresh holdings data');
    holdingsData = await scrapeQQQHoldingsTable();
    lastFetchTime = currentTime;
    return holdingsData;
  } catch (error) {
    // If there's an error fetching fresh data and we have cached data, use that
    if (holdingsData) {
      console.log('Error fetching fresh data, using cached data');
      return holdingsData;
    }
    
    // If we have no cached data, try to load from file
    try {
      const fileData = fs.readFileSync(outputFile, 'utf8');
      holdingsData = JSON.parse(fileData);
      console.log('Loaded holdings data from file');
      return holdingsData;
    } catch (fileError) {
      // If all else fails, throw the original error
      throw error;
    }
  }
}

// Set up Express server
const app = express();

// Enable CORS
app.use(cors());

// API endpoint to get holdings data
app.get('/holdings', async (req, res) => {
  try {
    const data = await getHoldingsData();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch holdings data', message: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`QQQ Holdings API running on port ${PORT}`);
  
  // Initial data fetch
  getHoldingsData().catch(error => {
    console.error('Initial data fetch failed:', error);
  });
});

