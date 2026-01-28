import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  return response.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString()
  });
}
