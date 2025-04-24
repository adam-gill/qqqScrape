import * as fs from 'fs';
import puppeteer from 'puppeteer-core';
import chrome from '@sparticuz/chromium';

// Configuration
const url = 'https://www.invesco.com/qqq-etf/en/about.html';
const tableBodyClass = 'view-all-holdings__table-body';

// Define the ticker map
const tickerMap = {
    "Apple Inc": "AAPL",
    "Microsoft Corp": "MSFT",
    "NVIDIA Corp": "NVDA",
    // ... rest of your ticker map
};

// Cache mechanism
let holdingsData: any = null;
let lastFetchTime = 0;
const CACHE_INTERVAL = 3600000; // 1 hour

/**
 * Scrapes the QQQ ETF holdings table
 */
export async function scrapeQQQHoldingsTable(): Promise<any> {
  let browser = null;
  
  try {
    console.log(`Fetching holdings data from: ${url}`);
    
    // Configure browser for Vercel serverless environment
    const executablePath = await chrome.executablePath();
    
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath,
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
        timestamp: new Date().toISOString(),
        itemCount: rows.length,
        items: rows.map((row, index) => {
          const companyCell = row.querySelector('td:first-child span');
          const percentCell = row.querySelector('td:last-child');
          const companyName = companyCell ? companyCell.textContent.trim() : '';
          const percentText = percentCell ? percentCell.textContent.trim() : '0%';
          const percent = parseFloat(percentText.replace('%', '')) || 0;
          
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
    result.items = result.items.map((item: any) => {
      const companyName = item.company || '';
      return {
        ...item,
        ticker: companyName && tickerMap[companyName] ? tickerMap[companyName] : companyName
      };
    });
    
    // Combine GOOG and GOOGL entries
    let googIndex = -1;
    let googlIndex = -1;
    let googPercent = 0;
    let googlPercent = 0;
    
    // Find both Google entries
    result.items.forEach((item: any, index: number) => {
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
      const filteredItems = result.items.filter((_: any, index: number) => 
        index !== googIndex && index !== googlIndex
      );
      
      // Add the combined entry
      filteredItems.push({
        position: filteredItems.length,
        company: "Alphabet Inc Class C",
        ticker: "GOOG",
        percent: totalPercent,
        id: result.items[googIndex].id
      });
      
      // Sort by percentage (descending)
      filteredItems.sort((a: any, b: any) => b.percent - a.percent);
      
      // Update positions
      result.items = filteredItems.map((item: any, index: number) => ({
        ...item,
        position: index
      }));
    }
    
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
export async function getHoldingsData(): Promise<any> {
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
    if (holdingsData) {
      console.log('Error fetching fresh data, using cached data');
      return holdingsData;
    }
    throw error;
  }
}
