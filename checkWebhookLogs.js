const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://fitgreen_user:Qkdwt5LM8x_N_vM@cluster0.sw9orf3.mongodb.net/fitgreen?retryWrites=true&w=majority';

async function checkLogs() {
  try {
    const dns = require('node:dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');
    
    const db = mongoose.connection;
    const logs = await db.collection('webhooklogs')
      .find({ type: 'store_status_update' })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
      
    if (logs.length === 0) {
      console.log('No store_status_update logs found in the database yet.');
      
      // Let's check for any recent webhook logs of any type just in case
      const anyLogs = await db.collection('webhooklogs')
        .find({})
        .sort({ timestamp: -1 })
        .limit(3)
        .toArray();
      console.log('Recent webhooks of ANY type:', JSON.stringify(anyLogs, null, 2));
    } else {
      console.log('Found recent store status webhooks:');
      console.log(JSON.stringify(logs, null, 2));
    }
  } catch (err) {
    console.error('Error fetching logs:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkLogs();
