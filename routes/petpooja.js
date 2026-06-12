const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const router = express.Router();

const Restaurant = require('../models/Restaurant');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Variant = require('../models/Variant');
const Addon = require('../models/Addon');
const Order = require('../models/Order');
const { relayOrderToPetpooja } = require('../utils/petpoojaRelay');

// --- HELPER: NORMALIZE STATUS (Step 5) ---
function normalizePetpoojaStatus(status) {
  const value = String(status).toLowerCase();
  const map = {
    accepted: "accepted",
    accept: "accepted",
    confirmed: "accepted",
    rejected: "rejected",
    reject: "rejected",
    cancelled: "cancelled",
    canceled: "cancelled",
    preparing: "preparing",
    food_ready: "ready",
    ready: "ready",
    dispatched: "dispatched",
    delivered: "delivered",
    completed: "delivered",
    // Numeric codes (Adjusted based on user feedback)
    "1": "accepted",
    "2": "preparing",
    "3": "cancelled",
    "4": "dispatched",
    "5": "ready",
    "6": "delivered",
    "7": "out for delivery"
  };
  return map[value] || value;
}

// Store Status is managed in app.locals in index.js

// --- FRONTEND MENU APIs ---
// Grouped Menu for Frontend
router.get('/menu', async (req, res) => {
  try {
    const categories = await Category.find().sort({ sortOrder: 1 });
    const items = await MenuItem.find({ available: true }).sort({ sortOrder: 1 });
    
    const menu = categories.map(cat => {
      const catItems = items.filter(item => item.petpoojaCategoryId === cat.petpoojaCategoryId);
      return {
        categoryName: cat.name,
        items: catItems.map(item => ({
          name: item.name,
          price: item.price,
          petpoojaItemId: item.petpoojaItemId,
          image: item.image,
          description: item.description,
          available: item.available
        }))
      };
    }).filter(cat => cat.items.length > 0);
    
    res.status(200).json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Fetch All Items (Including out of stock)
router.get('/items-all', async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ updatedAt: -1 });
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Update Item (Custom properties like macros, images)
router.put('/items/:id', async (req, res) => {
  try {
    const updateData = req.body;
    
    // Cloudinary upload if an image was updated (using similar logic as Product.js)
    const cloudinary = require('cloudinary').v2;
    if (updateData.image && updateData.image.startsWith('data:image')) {
      const uploadRes = await cloudinary.uploader.upload(updateData.image, { folder: 'fitgreen_products' });
      updateData.image = uploadRes.secure_url;
    }

    const item = await MenuItem.findOneAndUpdate(
      { itemId: req.params.id },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    res.status(200).json({ success: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    const items = await MenuItem.find({ available: true });
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. MENU PUSH WEBHOOK
router.post('/menu', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Petpooja Menu Push Webhook');
    
    // Save raw payload to DB for debugging
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'menu_push', 
      payload: payload 
    });

    if (payload && payload.restaurants && payload.restaurants.length > 0) {
      const restId = payload.restaurants[0].restaurantid || 'default';
      
      // 1. SEND IMMEDIATE SUCCESS RESPONSE TO PETPOOJA (to prevent timeouts and dashboard errors)
      // Petpooja often expects "success": "1" and exactly "Menu items are successfully listed."
      res.status(200).json({ 
        success: "1", 
        message: "Menu items are successfully listed.",
        restid: restId
      });

      // 2. PROCESS IN BACKGROUND
      (async () => {

        try {
          console.log("⚡ Starting background menu sync...");
          
          const extractedCategories = [];
          const extractedItems = [];
          const extractedVariants = [];
          const extractedAddons = [];

          // Robust Extraction Function for deep nesting
          function parseNode(node, currentCatId = null) {
            if (!node || typeof node !== 'object') return;

            if (Array.isArray(node)) {
              node.forEach(child => parseNode(child, currentCatId));
              return;
            }

            if (node.categoryid && node.categoryname) {
              extractedCategories.push({
                petpoojaCategoryId: node.categoryid,
                name: node.categoryname,
                sortOrder: parseInt(node.categoryrank) || 0,
                restaurantId: payload.restaurants[0].restaurantid || 'default'
              });
              currentCatId = node.categoryid;
            }

            if (node.itemid && (node.itemname || node.name)) {
              extractedItems.push({
                petpoojaItemId: node.itemid,
                name: node.itemname || node.name,
                price: parseFloat(node.item_price) || parseFloat(node.price) || 0,
                petpoojaCategoryId: node.item_categoryid || node.categoryid || currentCatId || 'default',
                available: node.active === "1" || node.in_stock === "1" || node.in_stock === "2" || node.available === true,
                sortOrder: parseInt(node.itemrank) || 0,
                restaurantId: payload.restaurants[0].restaurantid || 'default',
                image: node.item_image_url || node.image || '',
                description: node.itemdescription || node.item_description || node.description || ''
              });
            }

            if (node.attributeid && node.attributename) {
              if (node.attribute_type === 'addon') {
                extractedAddons.push({
                  addonId: node.attributeid,
                  itemId: node.itemid || 'unknown',
                  name: node.attributename,
                  price: parseFloat(node.price) || 0
                });
              } else {
                extractedVariants.push({
                  variantId: node.attributeid,
                  itemId: node.itemid || 'unknown',
                  name: node.attributename,
                  price: parseFloat(node.price) || 0
                });
              }
            }

            for (const key of Object.keys(node)) {
              if (typeof node[key] === 'object' && node[key] !== null) {
                parseNode(node[key], currentCatId);
              }
            }
          }

          // Run the recursive parser on the entire payload
          parseNode(payload);

          // Save Restaurant Info from the first restaurant in payload
          const firstRest = payload.restaurants[0];
          const details = firstRest.details || {};
          await Restaurant.findOneAndUpdate(
            { restaurantId: firstRest.restaurantid },
            { 
              restaurantId: firstRest.restaurantid, 
              restaurantName: details.restaurantname || 'FitGreen', 
              mappingCode: details.menusharingcode || 'tvjwdbz30q' 
            },
            { upsert: true }
          );

          // AGGRESSIVE FIX: Clear collections and drop indexes to prevent duplicate key errors
          try {
            await Category.deleteMany({});
            await Category.collection.dropIndexes();
            
            await MenuItem.deleteMany({});
            await MenuItem.collection.dropIndexes();

            await Addon.deleteMany({});
            await Addon.collection.dropIndexes();

            await Variant.deleteMany({});
            await Variant.collection.dropIndexes();
            
            console.log("🧹 Cleaned all menu collections and dropped legacy indexes");
          } catch (e) {
            console.error("Index cleanup warning:", e.message);
          }

          // Save Categories
          const catMap = {};
          for (const cat of extractedCategories) {
            const savedCat = await Category.findOneAndUpdate(
              { petpoojaCategoryId: cat.petpoojaCategoryId },
              { $set: cat },
              { upsert: true, new: true }
            );
            catMap[cat.petpoojaCategoryId] = savedCat._id;
          }

          // Save Items
          for (const item of extractedItems) {
            item.categoryId = catMap[item.petpoojaCategoryId];
            await MenuItem.findOneAndUpdate(
              { petpoojaItemId: item.petpoojaItemId },
              { $set: item },
              { upsert: true }
            );
          }

          // Save Addons
          const currentAddonIds = extractedAddons.map(a => a.addonId);
          for (const addon of extractedAddons) {
            await Addon.findOneAndUpdate(
              { addonId: addon.addonId },
              { $set: addon },
              { upsert: true }
            );
          }
          await Addon.deleteMany({ addonId: { $nin: currentAddonIds } });

          // Save Variants
          const currentVariantIds = extractedVariants.map(v => v.variantId);
          for (const variant of extractedVariants) {
            await Variant.findOneAndUpdate(
              { variantId: variant.variantId },
              { $set: variant },
              { upsert: true }
            );
          }
          await Variant.deleteMany({ variantId: { $nin: currentVariantIds } });

          console.log(`✅ Background Menu Sync Complete: ${extractedItems.length} items processed.`);
        } catch (backgroundError) {
          console.error("❌ Background Menu Push Error:", backgroundError);
        }
      })();
    } else {
      console.log('No restaurants found in payload, returning success to acknowledge.');
      res.status(200).json({ success: "1", message: "Menu items are successfully listed." });
    }
  } catch (error) {
    console.error('Menu Push Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: "0", message: error.message });
    }
  }
});


// 2. ITEM OFF WEBHOOK
router.post('/item-off', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Petpooja Item Off Webhook:', JSON.stringify(payload));

    // Save raw payload to DB for debugging
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'item_off', 
      payload: payload 
    });

    const itemID = payload.itemid || payload.item_id || payload.itemID;
    
    if (itemID) {
      const result = await MenuItem.findOneAndUpdate(
        { $or: [{ petpoojaItemId: itemID }, { itemId: itemID }] }, 
        { available: false },
        { new: true }
      );

      if (result) {
        console.log(`✅ Item ${itemID} (${result.name}) marked as OUT OF STOCK`);
      } else {
        console.warn(`⚠️ Item ${itemID} not found in DB`);
      }
    }
    res.status(200).json({ success: '1', message: 'Item marked as out of stock' });
  } catch (error) {
    console.error('Item Off Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 3. ITEM ON WEBHOOK
router.post('/item-on', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Petpooja Item On Webhook:', JSON.stringify(payload));

    // Save raw payload to DB for debugging
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'item_on', 
      payload: payload 
    });

    const itemID = payload.itemid || payload.item_id || payload.itemID;
    
    if (itemID) {
      const result = await MenuItem.findOneAndUpdate(
        { $or: [{ petpoojaItemId: itemID }, { itemId: itemID }] }, 
        { available: true },
        { new: true }
      );

      if (result) {
        console.log(`✅ Item ${itemID} (${result.name}) marked as AVAILABLE`);
      } else {
        console.warn(`⚠️ Item ${itemID} not found in DB`);
      }
    }
    res.status(200).json({ success: '1', message: 'Item marked as available' });
  } catch (error) {
    console.error('Item On Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 4. GET STORE STATUS WEBHOOK
router.post('/get-store-status', (req, res) => {
  const storeStatusStr = req.app.locals.storeStatus === 1 ? '1' : '0';
  res.status(200).json({ 
    status: "success",
    store_status: storeStatusStr,
    http_code: "200",
    message: "Store status fetched successfully"
  });
});

// 5. UPDATE STORE STATUS WEBHOOK
router.post('/update-store-status', (req, res) => {
  console.log('Received Petpooja Store Status Update Webhook:', JSON.stringify(req.body));
  
  // Save raw payload to DB for debugging
  const mongoose = require('mongoose');
  const db = mongoose.connection;
  db.collection('webhooklogs').insertOne({ 
    timestamp: new Date(), 
    type: 'store_status_update', 
    payload: req.body 
  }).catch(err => console.error('Failed to log webhook:', err));

  // Petpooja might send 'status' or 'store_status'
  const rawStatus = req.body.status !== undefined ? req.body.status : req.body.store_status;

  if (rawStatus !== undefined) {
    // Normalize status to 1 or 0
    const normalized = String(rawStatus).toUpperCase() === 'OPEN' || String(rawStatus) === '1' ? 1 : 0;
    req.app.locals.storeStatus = normalized;
    
    console.log(`✅ Store Status updated to: ${normalized === 1 ? 'ON/OPEN' : 'OFF/CLOSED'}`);

    // Emit real-time update via socket.io
    const io = req.app.get('socketio');
    if (io) {
      io.to('admin-room').emit('storeStatusUpdate', { status: normalized });
    }
  } else {
    console.warn('⚠️ Store status update received but no status field found in payload');
  }
  
  const storeStatusStr = req.app.locals.storeStatus === 1 ? '1' : '0';
  res.status(200).json({ 
    status: "success",
    store_status: storeStatusStr,
    http_code: "200",
    message: "Store status updated successfully"
  });
});

// 6. ORDER STATUS CALLBACK (Step 1 & 4)
router.post('/order-status', async (req, res) => {
  let orderID = "UNKNOWN";
  try {
    const payload = req.body;
    console.log("PETPOOJA ORDER STATUS CALLBACK:", JSON.stringify(payload, null, 2));

    orderID =
      payload.orderID ||
      payload.order_id ||
      payload.orderid ||
      payload.clientOrderID ||
      payload.client_order_id;

    const status =
      payload.status ||
      payload.order_status ||
      payload.orderStatus;

    // Step 8: Log Callback
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    const logData = {
      orderID: orderID,
      type: "order_status",
      rawPayload: payload,
      receivedAt: new Date(),
      processed: false
    };

    if (!orderID || !status) {
      logData.errorMessage = "Missing orderID or status";
      await db.collection('petpooja_callback_logs').insertOne(logData);
      return res.status(400).json({
        success: false,
        message: "Missing orderID or status"
      });
    }

    const normalizedStatus = normalizePetpoojaStatus(status);
    console.log(`Searching for order: ${orderID} to update status to: ${normalizedStatus}`);

    const order = await Order.findOneAndUpdate(
      { id: orderID }, // Step 3: Use local ID mapping
      {
        status: normalizedStatus,
        petpoojaCallbackRaw: payload,
        minimumPrepTime: payload.minimum_prep_time || payload.minimum_prep_time === 0 ? payload.minimum_prep_time : undefined,
        minimumDeliveryTime: payload.minimum_delivery_time || payload.minimum_delivery_time === 0 ? payload.minimum_delivery_time : undefined,
        lastStatusUpdatedAt: new Date()
      },
      { returnDocument: 'after' }
    );

    if (order) {
      logData.processed = true;
      console.log(`✅ Order ${order.id} updated to ${order.status}`);
      
      // Real-time update (Step 7 extension)
      const io = req.app.get('socketio');
      if (io && order.customerUid) {
        console.log(`📢 Attempting to emit statusUpdate to user: ${order.customerUid}`);
        io.to(order.customerUid).emit('statusUpdate', {
          orderId: order.id,
          status: normalizedStatus,
          minimumPrepTime: payload.minimum_prep_time,
          minimumDeliveryTime: payload.minimum_delivery_time,
          lastStatusUpdatedAt: order.lastStatusUpdatedAt || new Date()
        });
        
        // Also update User embedded order
        const User = require('../models/User');
        const userUpdate = await User.findOneAndUpdate(
          { uid: order.customerUid, "orders.id": order.id },
          { 
            $set: { 
              "orders.$.status": normalizedStatus,
              "orders.$.minimumPrepTime": payload.minimum_prep_time,
              "orders.$.minimumDeliveryTime": payload.minimum_delivery_time,
              "orders.$.lastStatusUpdatedAt": order.lastStatusUpdatedAt || new Date()
            } 
          },
          { returnDocument: 'after' }
        );
        
        if (userUpdate) {
          console.log(`✅ Successfully updated status in User ${order.customerUid} embedded orders.`);
        } else {
          console.warn(`⚠️ Could not find User ${order.customerUid} with Order ${order.id} in their profile.`);
        }
      }
    } else {
      logData.errorMessage = "Order not found in database";
    }

    await db.collection('petpooja_callback_logs').insertOne(logData);
    
    return res.status(200).json({
      success: true,
      message: "Order status updated"
    });

  } catch (error) {
    console.error("Petpooja callback error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Step 6: Add Order Status API for Frontend
router.get('/order-status/:orderID', async (req, res) => {
  try {
    const order = await Order.findOne({ id: req.params.orderID });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.status(200).json({
      success: true,
      orderID: order.id,
      status: order.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. INTERNAL ENDPOINT TO PLACE ORDER & RELAY TO PETPOOJA
router.post('/orders', async (req, res) => {
  try {
    const orderData = req.body;
    // Basic validation
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid order payload' });
    }

    // Save order locally first
    const newOrder = new Order(orderData);
    await newOrder.save();

    // Relay to Petpooja
    const petpoojaRes = await relayOrderToPetpooja(newOrder);

    res.status(200).json({ success: true, order: newOrder, petpoojaResponse: petpoojaRes });
  } catch (error) {
    console.error('Order Relay Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. UPDATE ORDER STATUS ON PETPOOJA (Admin/Website initiated cancellation)
router.post('/update-order-status', async (req, res) => {
  try {
    const { orderID, status, cancel_reason } = req.body;
    
    if (!orderID || !status) {
      return res.status(400).json({ success: false, message: 'Missing orderID or status' });
    }

    const payload = {
      app_key: process.env.PETPOOJA_APP_KEY,
      app_secret: process.env.PETPOOJA_APP_SECRET,
      access_token: process.env.PETPOOJA_ACCESS_TOKEN,
      restID: 'tvjwdbz30q',
      orderID: orderID,
      status: status, // typically '7' for cancelled, etc. depending on Petpooja status codes
      cancel_reason: cancel_reason || 'Cancelled by user'
    };

    const updateUrl = process.env.PETPOOJA_UPDATE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/update_order_status';
    
    let axiosConfig = {};
    if (process.env.PROXY_URL) {
      console.log('🔒 Routing Petpooja status update through static proxy...');
      const agent = new HttpsProxyAgent(process.env.PROXY_URL);
      axiosConfig = {
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false
      };
    }

    const petpoojaRes = await axios.post(updateUrl, payload, axiosConfig);
    
    // Update local DB as well
    await Order.findOneAndUpdate(
      { id: orderID },
      { status: 'cancelled' },
      { returnDocument: 'after' }
    );

    res.status(200).json({ success: true, message: 'Order status updated on Petpooja', response: petpoojaRes.data });
  } catch (error) {
    console.error('Update Order Status Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// CATCH-ALL FOR ANY UNHANDLED PETPOOJA WEBHOOKS
router.use(async (req, res, next) => {
  if (req.method === 'POST') {
    console.log(`⚠️ Unhandled Petpooja Webhook on ${req.path}:`, JSON.stringify(req.body));
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'unhandled_webhook', 
      path: req.path,
      payload: req.body 
    });
    return res.status(200).json({ success: '1', message: 'Logged' });
  }
  next();
});

module.exports = router;
