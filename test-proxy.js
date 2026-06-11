require('dotenv').config();
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function testProxy() {
  const proxyUrl = process.env.PROXY_URL;
  
  if (!proxyUrl) {
    console.log("❌ Error: PROXY_URL not found in .env file.");
    return;
  }

  console.log("🔒 Connecting through QuotaGuard Proxy...");
  
  const agent = new HttpsProxyAgent(proxyUrl);
  
  try {
    // We are making a request to a service that returns the IP address it sees.
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false
    });
    
    console.log("\n✅ SUCCESS! The request went through the proxy.");
    console.log("🌐 The internet sees your IP address as: " + response.data.ip);
    console.log("\nIf this matches one of the two QuotaGuard Static IPs you gave to Petpooja, then your local setup is working perfectly!");

  } catch (error) {
    console.log("\n❌ Failed to connect through proxy.");
    console.error(error.message);
  }
}

testProxy();
