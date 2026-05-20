require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);


async function checkLogs() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'fitgreen' });
        const db = mongoose.connection;
        
        console.log("Checking petpooja_callback_logs...");
        const logs = await db.collection('petpooja_callback_logs').find({}).sort({ receivedAt: -1 }).limit(5).toArray();
        console.log(JSON.stringify(logs, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLogs();
