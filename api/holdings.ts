import { VercelRequest, VercelResponse } from '@vercel/node';
import { getHoldingsData } from '../lib/scraper';
import { agPicks } from '../lib/config';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
    // Set longer timeout for Vercel
    response.setHeader('Content-Type', 'application/json');

    // Get data with caching
    const data = await getHoldingsData();

    // Add agPicks and lastUpdated to the response
    const responseData = {
      ...data,
      agPicks,
      lastUpdated: new Date().toISOString()
    };

    // Return the data
    return response.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error in holdings endpoint:', error);
    return response.status(500).json({
      error: 'Failed to fetch holdings data',
      message: error.message
    });
  }
}
